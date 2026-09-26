// Database access. Every query goes through query(text, params) — parameterised,
// never string-built — so visitor input can't become SQL.
// The schema also enforces its own rules (CHECK constraints), so even a bug in the
// API can't write an out-of-range value.
import { neon } from '@neondatabase/serverless';

let client = null;
let ready = null;

// Tests swap in an in-memory Postgres (PGlite) through this hook.
export function setClient(c) { client = c; ready = null; }

function getClient() {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // Refuse unencrypted connections: Neon URLs carry sslmode=require; anything else is a misconfiguration.
  if (!/sslmode=(require|verify-full|verify-ca)/.test(url)) throw new Error('DATABASE_URL must use sslmode=require');
  const sql = neon(url);
  client = { query: async (text, params = []) => ({ rows: await sql.query(text, params) }) };
  return client;
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS visitors (
  id           uuid PRIMARY KEY,
  first_seen   timestamptz NOT NULL DEFAULT now(),
  last_seen    timestamptz NOT NULL DEFAULT now(),
  visits       integer     NOT NULL DEFAULT 1 CHECK (visits BETWEEN 1 AND 100000),
  name_enc     text        CHECK (name_enc IS NULL OR (name_enc LIKE 'v1:%' AND length(name_enc) <= 200)),
  role         text        CHECK (role IS NULL OR role IN ('hiring','project','collab','explore')),
  sound        text        CHECK (sound IS NULL OR sound IN ('on','off')),
  motion       text        CHECK (motion IS NULL OR motion IN ('full','calm')),
  start_choice text        CHECK (start_choice IS NULL OR start_choice IN ('#works','#services','#experience','#insights','#contact','#top')),
  skipped      boolean,
  country      text        CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  device       text        CHECK (device IS NULL OR device IN ('mobile','tablet','desktop')),
  lang         text        CHECK (lang IS NULL OR length(lang) <= 12),
  referrer     text        CHECK (referrer IS NULL OR length(referrer) <= 80)
);
CREATE TABLE IF NOT EXISTS events (
  id         bigserial PRIMARY KEY,
  visitor_id uuid        NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  type       text        NOT NULL CHECK (type IN ('visit','launch','chapter','action','leave')),
  name       text        CHECK (name IS NULL OR length(name) <= 24),
  value      integer     CHECK (value IS NULL OR value BETWEEN 0 AND 7200),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS theme text CHECK (theme IS NULL OR theme IN ('dark','light'));
CREATE INDEX IF NOT EXISTS events_created_idx ON events (created_at);
CREATE INDEX IF NOT EXISTS events_visitor_idx ON events (visitor_id, created_at);
CREATE INDEX IF NOT EXISTS visitors_last_seen_idx ON visitors (last_seen);
CREATE TABLE IF NOT EXISTS login_attempts (
  key        text        NOT NULL,
  ok         boolean     NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_idx ON login_attempts (key, created_at);
CREATE TABLE IF NOT EXISTS rate_hits (
  key        text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_hits_idx ON rate_hits (key, created_at);
CREATE TABLE IF NOT EXISTS filtered (
  day    date    NOT NULL,
  reason text    NOT NULL CHECK (reason IN ('bot','automation','rate','invalid','origin')),
  n      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, reason)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id         bigserial PRIMARY KEY,
  action     text        NOT NULL CHECK (action IN ('login','login_failed','login_locked','logout','revoke','export','delete','view_visitor')),
  detail     text        CHECK (detail IS NULL OR length(detail) <= 120),
  ip_key     text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_idx ON audit_log (created_at);
CREATE TABLE IF NOT EXISTS admin_state (
  id              integer PRIMARY KEY CHECK (id = 1),
  session_version integer NOT NULL DEFAULT 1
);
INSERT INTO admin_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING
`;

// One cheap check per cold start: if the newest table and column already exist the schema is
// current and nothing else runs. Only the very first deploy (or an upgrade) executes the DDL.
const SCHEMA_PROBE = `SELECT to_regclass('public.admin_state') IS NOT NULL
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'visitors' AND column_name = 'theme') AS ok`;

async function ensureSchema(c) {
  if (!ready) {
    ready = (async () => {
      const probe = await c.query(SCHEMA_PROBE);
      if (probe.rows[0]?.ok) return;
      for (const stmt of SCHEMA.split(';').map((x) => x.trim()).filter(Boolean)) await c.query(stmt);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

export async function query(text, params = []) {
  const c = getClient();
  await ensureSchema(c);
  const res = await c.query(text, params);
  return res.rows;
}

// Counts traffic that was refused, so the dashboard can show how much was filtered.
export async function countFiltered(reason) {
  try {
    await query(
      `INSERT INTO filtered (day, reason, n) VALUES (current_date, $1, 1)
       ON CONFLICT (day, reason) DO UPDATE SET n = filtered.n + 1`,
      [reason],
    );
  } catch { /* never let accounting break a request */ }
}
