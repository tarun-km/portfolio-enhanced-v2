// GET    /api/admin/visitor?id=<uuid>  → one visitor + their event timeline
// DELETE /api/admin/visitor?id=<uuid>  → erase that visitor and all their events (data requests)
import { query } from '../_lib/db.js';
import { send, sameOrigin } from '../_lib/http.js';
import { requireAdmin, audit } from '../_lib/auth.js';
import { isUuid } from '../_lib/validate.js';
import { decrypt } from '../_lib/crypto.js';

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res, send))) return;
  const id = new URL(req.url, 'http://x').searchParams.get('id');
  if (!isUuid(id)) return send(res, 400, { error: 'id' });
  try {
    if (req.method === 'GET') {
      const [v] = await query(
        `SELECT id, name_enc, role, sound, motion, theme, start_choice, skipped, country, device, lang, referrer, visits,
                to_char(first_seen, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS first_seen,
                to_char(last_seen, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen
         FROM visitors WHERE id = $1`,
        [id],
      );
      if (!v) return send(res, 404, { error: 'not found' });
      const events = await query(
        `SELECT type, name, value, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at
         FROM events WHERE visitor_id = $1 ORDER BY created_at DESC LIMIT 200`,
        [id],
      );
      const { name_enc: nameEnc, ...rest } = v;
      await audit(req, 'view_visitor', id);
      return send(res, 200, { visitor: { ...rest, name: decrypt(nameEnc) }, events });
    }
    if (req.method === 'DELETE') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
      const rows = await query('DELETE FROM visitors WHERE id = $1 RETURNING id', [id]); // events cascade
      await audit(req, 'delete', id);
      return send(res, 200, { ok: true, deleted: rows.length });
    }
    return send(res, 405, { error: 'method' }, { Allow: 'GET, DELETE' });
  } catch (e) { console.error('visitor failed', e.message); return send(res, 500, { error: 'server' }); }
}
