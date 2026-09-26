// POST /api/admin/login  { password }  → sets the admin session cookie
import { send, readJson, sameOrigin } from '../_lib/http.js';
import { verifyPassword, issueToken, sessionCookie, ipKey, loginAllowed, recordAttempt, audit } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' }, { Allow: 'POST' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
  if (!process.env.ADMIN_PASSWORD_HASH || !process.env.SESSION_SECRET) return send(res, 503, { error: 'not configured' });

  let body;
  try { body = await readJson(req, 1024); } catch { return send(res, 400, { error: 'body' }); }

  const key = ipKey(req);
  try {
    if (!(await loginAllowed(key))) { await audit(req, 'login_locked'); return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' }); }
    const ok = verifyPassword(String(body.password || ''), process.env.ADMIN_PASSWORD_HASH);
    await recordAttempt(key, ok);
    if (!ok) {
      await audit(req, 'login_failed');
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 400)); // blunt timing / brute force
      return send(res, 401, { error: 'Wrong password.' });
    }
    await audit(req, 'login');
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(await issueToken()) });
  } catch (e) {
    console.error('login failed', e.message);
    return send(res, 500, { error: 'server' });
  }
}
