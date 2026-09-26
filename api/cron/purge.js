// Daily retention job (scheduled in vercel.json).
// Deletes visitors inactive for a year, plus stale rate-limit rows and old filter counters.
// Vercel sends `Authorization: Bearer <CRON_SECRET>`; anything else is refused.
import { timingSafeEqual } from 'node:crypto';
import { query } from '../_lib/db.js';
import { send, header } from '../_lib/http.js';

const RETENTION_DAYS = 365;

export default async function handler(req, res) {
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`;
  const got = header(req, 'authorization') || '';
  const a = Buffer.from(got), b = Buffer.from(expected);
  if (!process.env.CRON_SECRET || a.length !== b.length || !timingSafeEqual(a, b)) return send(res, 401, { error: 'auth' });
  const rows = await query(
    'DELETE FROM visitors WHERE last_seen < now() - make_interval(days => $1) RETURNING id',
    [RETENTION_DAYS],
  );
  await query("DELETE FROM rate_hits WHERE created_at < now() - interval '2 hours'");
  await query("DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'");
  await query('DELETE FROM filtered WHERE day < current_date - 400');
  return send(res, 200, { deleted: rows.length });
}
