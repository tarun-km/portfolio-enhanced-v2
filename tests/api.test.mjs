// End-to-end tests for the API against a real (in-memory) Postgres via PGlite.
// Run: npm test
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { setClient, query } from '../api/_lib/db.js';
import { hashPassword, issueToken, cookieName } from '../api/_lib/auth.js';
import collect from '../api/collect.js';
import login from '../api/admin/login.js';
import stats from '../api/admin/stats.js';
import visitor from '../api/admin/visitor.js';
import exportCsv from '../api/admin/export.js';
import revoke from '../api/admin/revoke.js';
import auditLog from '../api/admin/audit.js';
import purge from '../api/cron/purge.js';

process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-123';
process.env.ADMIN_PASSWORD_HASH = hashPassword('correct horse battery');
process.env.CRON_SECRET = 'cron-secret';
process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString('base64url');

const HOST = 'tarunkm.test';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
let ipSeq = 1;
const freshIp = () => `203.0.113.${ipSeq++}`;
function req({ method = 'GET', url = '/', body, headers = {}, ip } = {}) {
  return { method, url, body, headers: { host: HOST, origin: `https://${HOST}`, 'user-agent': UA, 'sec-fetch-site': 'same-origin', 'x-forwarded-for': ip || freshIp(), ...headers }, socket: {} };
}
function res() {
  const r = { statusCode: 200, headers: {}, body: '' };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.end = (b = '') => { r.body = b; r.done = true; };
  r.json = () => JSON.parse(r.body || '{}');
  return r;
}
const call = async (h, opts) => { const r = res(); await h(req(opts), r); return r; };
const adminCookie = async () => `${cookieName}=${await issueToken()}`;
const visit = (vid, extra = [], opts = {}) => call(collect, { method: 'POST', body: { vid, events: [{ type: 'visit', device: 'desktop' }, ...extra] }, ...opts });

before(async () => {
  const db = new PGlite();
  setClient({ query: (text, params) => db.query(text, params) });
});

test('collect: stores a visit, launch profile and events', async () => {
  const vid = randomUUID();
  const r = await visit(vid, [
    { type: 'launch', name: 'Asha', role: 'project', sound: 'on', motion: 'calm', theme: 'light', start: '#services' },
    { type: 'chapter', name: '02' }, { type: 'action', name: 'pass' },
  ], { headers: { 'x-vercel-ip-country': 'IN' } });
  assert.equal(r.statusCode, 204);
  const [v] = await query('SELECT * FROM visitors WHERE id = $1', [vid]);
  assert.equal(v.role, 'project');
  assert.equal(v.theme, 'light');
  assert.equal(v.country, 'IN');
  assert.equal((await query('SELECT type FROM events WHERE visitor_id = $1', [vid])).length, 4);
});

test('security: visitor names are encrypted at rest and decrypted only for the admin', async () => {
  const vid = randomUUID();
  await visit(vid, [{ type: 'launch', name: 'Meera Iyer', role: 'hiring' }]);
  const [raw] = await query('SELECT name_enc FROM visitors WHERE id = $1', [vid]);
  assert.ok(raw.name_enc.startsWith('v1:'), 'stored as ciphertext');
  assert.ok(!raw.name_enc.includes('Meera'), 'plaintext never in the database');
  const g = await call(visitor, { url: `/api/admin/visitor?id=${vid}`, headers: { cookie: await adminCookie() } });
  assert.equal(g.json().visitor.name, 'Meera Iyer');
});

test('authenticity: crawlers, scripts and automated browsers are dropped and counted', async () => {
  const before = (await query("SELECT COALESCE(sum(n),0)::int AS n FROM filtered WHERE reason = 'bot'"))[0].n;
  for (const ua of ['Googlebot/2.1 (+http://www.google.com/bot.html)', 'curl/8.4.0', 'python-requests/2.31', 'Mozilla/5.0 HeadlessChrome/120.0']) {
    const vid = randomUUID();
    assert.equal((await visit(vid, [], { headers: { 'user-agent': ua } })).statusCode, 204);
    assert.equal((await query('SELECT 1 FROM visitors WHERE id = $1', [vid])).length, 0, `${ua} not stored`);
  }
  const after = (await query("SELECT sum(n)::int AS n FROM filtered WHERE reason = 'bot'"))[0].n;
  assert.equal(after - before, 4);
  const auto = await call(collect, { method: 'POST', body: { auto: true } });
  assert.equal(auto.statusCode, 204);
  assert.equal((await query("SELECT sum(n)::int AS n FROM filtered WHERE reason = 'automation'"))[0].n, 1);
});

test('authenticity: one network cannot fabricate a crowd of visitors', async () => {
  const ip = '198.18.0.77';
  let last;
  for (let i = 0; i < 32; i++) last = await visit(randomUUID(), [], { ip });
  assert.equal(last.statusCode, 429);
});

test('authenticity: events for an unknown visitor without a page view are refused', async () => {
  const r = await call(collect, { method: 'POST', body: { vid: randomUUID(), events: [{ type: 'action', name: 'pass' }] } });
  assert.equal(r.statusCode, 400);
});

test('collect: rejects bad input, foreign origins, extra fields and injection attempts', async () => {
  const vid = randomUUID();
  assert.equal((await call(collect, { method: 'POST', body: { vid: 'nope', events: [{ type: 'visit' }] } })).statusCode, 400);
  assert.equal((await call(collect, { method: 'POST', body: { vid, events: [{ type: 'drop table' }] } })).statusCode, 400);
  assert.equal((await call(collect, { method: 'POST', body: { vid, events: [{ type: 'visit' }], admin: true } })).statusCode, 400);
  assert.equal((await call(collect, { method: 'POST', body: { vid, events: [{ type: 'visit' }] }, headers: { origin: 'https://evil.example' } })).statusCode, 403);
  assert.equal((await call(collect, { method: 'GET' })).statusCode, 405);
  const inj = await visit(vid, [{ type: 'launch', name: "Robert'); DROP TABLE visitors;-- <script>", role: 'hiring' }]);
  assert.equal(inj.statusCode, 204);
  assert.ok((await query('SELECT count(*)::int AS n FROM visitors'))[0].n >= 2, 'table still exists');
});

test('database: CHECK constraints refuse out-of-schema values even if the API were bypassed', async () => {
  const vid = randomUUID();
  await assert.rejects(query("INSERT INTO visitors (id, role) VALUES ($1, 'admin')", [vid]));
  await assert.rejects(query("INSERT INTO visitors (id, country) VALUES ($1, 'india')", [vid]));
  await assert.rejects(query("INSERT INTO visitors (id, theme) VALUES ($1, 'neon')", [vid]));
  await assert.rejects(query("INSERT INTO visitors (id, name_enc) VALUES ($1, 'plain text name')", [vid]));
});

test('collect: honours Global Privacy Control', async () => {
  const vid = randomUUID();
  assert.equal((await visit(vid, [], { headers: { 'sec-gpc': '1' } })).statusCode, 204);
  assert.equal((await query('SELECT * FROM visitors WHERE id = $1', [vid])).length, 0);
});

test('collect: rate-limits a single visitor', async () => {
  const vid = randomUUID();
  const ip = '198.18.1.1';
  await visit(vid, [], { ip });
  let last;
  for (let i = 0; i < 5; i++) last = await call(collect, { method: 'POST', ip, body: { vid, events: Array(15).fill({ type: 'action', name: 'hud_cta' }) } });
  assert.equal(last.statusCode, 429);
});

test('login: wrong password fails, right one sets a __Host- secure cookie, brute force locks out', async () => {
  const bad = await call(login, { method: 'POST', body: { password: 'nope' }, ip: '198.51.100.1' });
  assert.equal(bad.statusCode, 401);
  const good = await call(login, { method: 'POST', body: { password: 'correct horse battery' }, ip: '198.51.100.1' });
  assert.equal(good.statusCode, 200);
  const cookie = good.headers['set-cookie'];
  for (const flag of ['__Host-', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(cookie.includes(flag), flag);
  let r;
  for (let i = 0; i < 6; i++) r = await call(login, { method: 'POST', body: { password: `guess${i}` }, ip: '198.51.100.2' });
  assert.equal(r.statusCode, 429);
});

test('admin endpoints refuse without a valid session', async () => {
  assert.equal((await call(stats, { url: '/api/admin/stats?days=30' })).statusCode, 401);
  assert.equal((await call(stats, { url: '/api/admin/stats?days=30', headers: { cookie: `${cookieName}=forged.token` } })).statusCode, 401);
  assert.equal((await call(exportCsv, { url: '/api/admin/export?days=30' })).statusCode, 401);
  assert.equal((await call(auditLog, { url: '/api/admin/audit' })).statusCode, 401);
});

test('stats: returns every aggregate, in the owner timezone, with filtered counts', async () => {
  const r = await call(stats, { url: '/api/admin/stats?days=30', headers: { cookie: await adminCookie() } });
  assert.equal(r.statusCode, 200);
  const s = r.json();
  for (const k of ['kpi', 'prev', 'daily', 'theme', 'roles', 'chapters', 'actions', 'heat', 'engagement', 'launch', 'recent', 'filtered', 'live', 'freshness']) assert.ok(k in s, k);
  assert.equal(s.timezone, 'Asia/Kolkata');
  assert.equal(s.daily.length, 30);
  assert.ok(s.filtered.some((f) => f.k === 'bot'));
  assert.ok(s.recent.some((v) => v.name === 'Meera Iyer'), 'names decrypted in the list');
  assert.equal((await call(stats, { url: '/api/admin/stats?days=13', headers: { cookie: await adminCookie() } })).statusCode, 400);
});

test('export: CSV neutralises spreadsheet formulas and is audited', async () => {
  await visit(randomUUID(), [{ type: 'launch', name: '=HYPERLINK("x")', role: 'hiring' }]);
  const r = await call(exportCsv, { url: '/api/admin/export?days=30', headers: { cookie: await adminCookie() } });
  assert.equal(r.statusCode, 200);
  assert.ok(r.body.includes(`"'=HYPERLINK(""x"")"`), 'formula prefixed with a quote');
  const log = await call(auditLog, { url: '/api/admin/audit', headers: { cookie: await adminCookie() } });
  assert.ok(log.json().entries.some((e) => e.action === 'export'));
  assert.ok(!JSON.stringify(log.json()).includes('ip_key'), 'hashes never leave the server');
});

test('visitor: erase cascades events and is audited', async () => {
  const [{ id }] = await query('SELECT id FROM visitors LIMIT 1');
  const d = await call(visitor, { method: 'DELETE', url: `/api/admin/visitor?id=${id}`, headers: { cookie: await adminCookie() } });
  assert.equal(d.statusCode, 200);
  assert.equal((await query('SELECT count(*)::int AS n FROM events WHERE visitor_id = $1', [id]))[0].n, 0);
  assert.ok((await query("SELECT 1 FROM audit_log WHERE action = 'delete' AND detail = $1", [id])).length);
});

test('revoke: signing out everywhere invalidates every existing session', async () => {
  const old = await adminCookie();
  assert.equal((await call(stats, { url: '/api/admin/stats?days=7', headers: { cookie: old } })).statusCode, 200);
  assert.equal((await call(revoke, { method: 'POST', headers: { cookie: old } })).statusCode, 200);
  assert.equal((await call(stats, { url: '/api/admin/stats?days=7', headers: { cookie: old } })).statusCode, 401);
  assert.equal((await call(stats, { url: '/api/admin/stats?days=7', headers: { cookie: await adminCookie() } })).statusCode, 200, 'new sign-in works');
});

test('cron purge: needs the secret, deletes stale visitors', async () => {
  assert.equal((await call(purge, { headers: { authorization: 'Bearer wrong' } })).statusCode, 401);
  const vid = randomUUID();
  await visit(vid);
  await query("UPDATE visitors SET last_seen = now() - interval '400 days' WHERE id = $1", [vid]);
  const r = await call(purge, { headers: { authorization: 'Bearer cron-secret' } });
  assert.equal(r.statusCode, 200);
  assert.ok(r.json().deleted >= 1);
});
