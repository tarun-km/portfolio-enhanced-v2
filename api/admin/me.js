// GET /api/admin/me → 200 + setup health if the session is valid, 401 otherwise
import { send } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';
import { cryptoReady } from '../_lib/crypto.js';
import { TZ } from '../_lib/stats.js';

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res, send))) return;
  return send(res, 200, {
    ok: true,
    health: {
      encryption: cryptoReady(),
      cron: Boolean(process.env.CRON_SECRET),
      tls: /sslmode=(require|verify-full|verify-ca)/.test(process.env.DATABASE_URL || ''),
      timezone: TZ(),
    },
  });
}
