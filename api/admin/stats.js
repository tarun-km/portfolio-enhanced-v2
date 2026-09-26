// GET /api/admin/stats?days=30 → every aggregate the dashboard draws
import { send } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';
import { buildStats, RANGES } from '../_lib/stats.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' }, { Allow: 'GET' });
  if (!(await requireAdmin(req, res, send))) return;
  const days = Number(new URL(req.url, 'http://x').searchParams.get('days'));
  if (!RANGES.includes(days)) return send(res, 400, { error: 'days' });
  try { return send(res, 200, await buildStats(days)); }
  catch (e) { console.error('stats failed', e.message); return send(res, 500, { error: 'server' }); }
}
