// GET /api/admin/export?days=30 → CSV of visitors (formula-injection safe, audited)
import { query } from '../_lib/db.js';
import { send } from '../_lib/http.js';
import { requireAdmin, audit } from '../_lib/auth.js';
import { RANGES } from '../_lib/stats.js';
import { decrypt } from '../_lib/crypto.js';

// Cells starting with = + - @ are prefixed so spreadsheets don't execute them.
const cell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res, send))) return;
  const days = Number(new URL(req.url, 'http://x').searchParams.get('days'));
  if (!RANGES.includes(days)) return send(res, 400, { error: 'days' });
  const rows = await query(
    `SELECT id, name_enc, role, sound, motion, theme, start_choice, skipped, country, device, lang, referrer, visits,
            to_char(first_seen, 'YYYY-MM-DD HH24:MI') AS first_seen, to_char(last_seen, 'YYYY-MM-DD HH24:MI') AS last_seen
     FROM visitors WHERE last_seen > now() - make_interval(days => $1) ORDER BY last_seen DESC`,
    [days],
  );
  await audit(req, 'export', `${days}d, ${rows.length} rows`);
  const cols = ['id', 'name', 'role', 'sound', 'motion', 'theme', 'start_choice', 'skipped', 'country', 'device', 'lang', 'referrer', 'visits', 'first_seen', 'last_seen'];
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(c === 'name' ? decrypt(r.name_enc) : r[c])).join(','))].join('\n');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="visitors-${days}d.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(csv);
}
