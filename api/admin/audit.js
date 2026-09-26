// GET /api/admin/audit → last 60 admin actions (security log)
import { query } from '../_lib/db.js';
import { send } from '../_lib/http.js';
import { requireAdmin, ipKey } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' }, { Allow: 'GET' });
  if (!(await requireAdmin(req, res, send))) return;
  const mine = ipKey(req);
  const rows = await query(
    `SELECT action, detail, ip_key, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at
     FROM audit_log ORDER BY created_at DESC LIMIT 60`,
  );
  // Only reveal whether an entry came from *this* network — never the hash itself
  return send(res, 200, { entries: rows.map((r) => ({ action: r.action, detail: r.detail, at: r.at, thisNetwork: r.ip_key === mine })) });
}
