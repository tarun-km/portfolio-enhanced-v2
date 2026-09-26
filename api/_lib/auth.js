// Admin authentication.
//  - The password is never stored: ADMIN_PASSWORD_HASH holds "scrypt$<salt>$<hash>" (see scripts/hash-password.mjs).
//  - Sessions are HMAC-SHA256-signed tokens in an HttpOnly, Secure, SameSite=Strict cookie, 8 h.
//  - Each token carries a session version; "sign out everywhere" bumps it in the DB and kills every old token.
//  - Login attempts are rate-limited per (hashed) IP; every admin action lands in an audit log.
import { scryptSync, timingSafeEqual, createHmac, randomBytes, createHash } from 'node:crypto';
import { query } from './db.js';
import { clientIp, header } from './http.js';

const COOKIE = '__Host-tk_admin'; // __Host- prefix: Secure, Path=/, no Domain — can't be set by a subdomain
const SESSION_HOURS = 8;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (32+ chars)');
  return s;
}

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 256 || !stored) return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const a = Buffer.from(scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex'));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const sign = (payload) => createHmac('sha256', secret()).update(payload).digest('base64url');

async function sessionVersion() {
  const [row] = await query('SELECT session_version AS v FROM admin_state WHERE id = 1');
  return row?.v ?? 1;
}

export async function issueToken(now = Date.now()) {
  const v = await sessionVersion();
  const payload = b64url(JSON.stringify({ sub: 'admin', v, exp: now + SESSION_HOURS * 3600e3, n: randomBytes(8).toString('hex') }));
  return `${payload}.${sign(payload)}`;
}

function readPayload(token, now) {
  if (typeof token !== 'string' || token.length > 512 || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.sub === 'admin' && typeof data.exp === 'number' && data.exp > now ? data : null;
  } catch { return null; }
}

export async function verifyToken(token, now = Date.now()) {
  const data = readPayload(token, now);
  if (!data) return false;
  return data.v === (await sessionVersion());
}

export function sessionCookie(token) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export function readCookie(req) {
  const raw = header(req, 'cookie') || '';
  const m = raw.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  return m ? m.slice(COOKIE.length + 1) : '';
}
export const cookieName = COOKIE;

export const isAdmin = (req) => verifyToken(readCookie(req));

export async function revokeAll() {
  await query('UPDATE admin_state SET session_version = session_version + 1 WHERE id = 1');
}

// IPs are only ever stored as a keyed hash.
export const ipKey = (req) => createHash('sha256').update(`${secret()}|${clientIp(req)}`).digest('hex').slice(0, 32);
// A day-scoped variant for visitor rate limits: can't be linked across days.
export const dailyIpKey = (req) =>
  createHash('sha256').update(`${secret()}|${new Date().toISOString().slice(0, 10)}|${clientIp(req)}`).digest('hex').slice(0, 32);

export async function loginAllowed(key) {
  const [row] = await query(
    "SELECT count(*)::int AS n FROM login_attempts WHERE key = $1 AND ok = false AND created_at > now() - interval '15 minutes'",
    [key],
  );
  return (row?.n ?? 0) < 5;
}
export async function recordAttempt(key, ok) {
  await query('INSERT INTO login_attempts (key, ok) VALUES ($1, $2)', [key, ok]);
  await query("DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'");
}

export async function audit(req, action, detail = null) {
  try {
    await query('INSERT INTO audit_log (action, detail, ip_key) VALUES ($1, $2, $3)', [action, detail ? String(detail).slice(0, 120) : null, ipKey(req)]);
    await query("DELETE FROM audit_log WHERE created_at < now() - interval '180 days'");
  } catch { /* auditing must not block the request */ }
}

// Shared guard for admin endpoints: 503 if not configured, 401 if not signed in.
export async function requireAdmin(req, res, send) {
  try {
    if (!(await isAdmin(req))) { send(res, 401, { error: 'auth' }); return false; }
    return true;
  } catch (e) {
    console.error('auth check failed', e.message);
    send(res, 503, { error: 'not configured' });
    return false;
  }
}
