// GET /api/health → { ok, db } — lets you confirm a deploy is wired to the database.
// Deliberately reveals nothing about configuration beyond "working / not working".
import { query } from './_lib/db.js';
import { send } from './_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' }, { Allow: 'GET' });
  try {
    await query('SELECT 1');
    return send(res, 200, { ok: true, db: true });
  } catch (e) {
    console.error('health: database unreachable', e.message);
    return send(res, 503, { ok: false, db: false });
  }
}
