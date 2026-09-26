// POST /api/admin/revoke → invalidates every admin session everywhere (including this one)
import { send, sameOrigin } from '../_lib/http.js';
import { requireAdmin, revokeAll, clearCookie, audit } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' }, { Allow: 'POST' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
  if (!(await requireAdmin(req, res, send))) return;
  await audit(req, 'revoke');
  await revokeAll();
  return send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
}
