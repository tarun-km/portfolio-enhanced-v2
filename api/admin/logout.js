// POST /api/admin/logout → clears the session cookie
import { send, sameOrigin } from '../_lib/http.js';
import { clearCookie, audit, isAdmin } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' }, { Allow: 'POST' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
  try { if (await isAdmin(req)) await audit(req, 'logout'); } catch { /* still clear the cookie */ }
  return send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
}
