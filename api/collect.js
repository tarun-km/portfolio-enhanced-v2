// POST /api/collect — the only public write endpoint.
// Accepts a small batch of validated events for one anonymous visitor id.
// Authenticity: crawlers, headless browsers and scripted clients are dropped (and counted),
// and each network is rate-limited so one machine can't fabricate a crowd of visitors.
import { query, countFiltered } from './_lib/db.js';
import { send, readJson, sameOrigin, header } from './_lib/http.js';
import { validateBatch } from './_lib/validate.js';
import { dailyIpKey } from './_lib/auth.js';
import { encrypt } from './_lib/crypto.js';

const MAX_EVENTS_PER_VISITOR_MINUTE = 60;
const MAX_BATCHES_PER_NETWORK_MINUTE = 40;
const MAX_NEW_VISITORS_PER_NETWORK_HOUR = 30;

const BOT_UA = /bot|crawl|spider|slurp|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|preview|facebookexternalhit|embedly|quora link|whatsapp|telegram|discord|skype|curl|wget|python|httpx|axios|node-fetch|undici|go-http|java\/|okhttp|postman|insomnia|monitor|uptime|pingdom|scan/i;

export function looksAutomated(req) {
  const ua = header(req, 'user-agent') || '';
  if (ua.length < 20 || BOT_UA.test(ua)) return 'bot';
  // Real browsers send these fetch-metadata headers on same-origin fetches
  const site = header(req, 'sec-fetch-site');
  if (site && site !== 'same-origin') return 'origin';
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' }, { Allow: 'POST' });
  if (!sameOrigin(req)) { await countFiltered('origin'); return send(res, 403, { error: 'origin' }); }
  // Respect browser privacy signals server-side too
  if (header(req, 'sec-gpc') === '1' || header(req, 'dnt') === '1') return send(res, 204);
  const auto = looksAutomated(req);
  if (auto) { await countFiltered(auto === 'origin' ? 'origin' : 'bot'); return send(res, 204); }

  let body;
  try { body = await readJson(req, 4096); } catch (e) { await countFiltered('invalid'); return send(res, e.status || 400, { error: 'body' }); }
  if (body && body.auto === true) { await countFiltered('automation'); return send(res, 204); } // navigator.webdriver seen client-side
  const batch = validateBatch(body);
  if (batch.error) { await countFiltered('invalid'); return send(res, 400, { error: batch.error }); }

  const country = (header(req, 'x-vercel-ip-country') || '').slice(0, 2).toUpperCase();
  const net = dailyIpKey(req);

  try {
    // --- rate limits ---
    const [lim] = await query(
      `SELECT
         (SELECT count(*)::int FROM events WHERE visitor_id = $1 AND created_at > now() - interval '1 minute') AS per_visitor,
         (SELECT count(*)::int FROM rate_hits WHERE key = $2 AND created_at > now() - interval '1 minute') AS per_net,
         (SELECT count(*)::int FROM rate_hits WHERE key = $3 AND created_at > now() - interval '1 hour') AS new_per_net,
         EXISTS (SELECT 1 FROM visitors WHERE id = $1) AS known`,
      [batch.vid, net, `new:${net}`],
    );
    if (lim.per_visitor + batch.events.length > MAX_EVENTS_PER_VISITOR_MINUTE
      || lim.per_net >= MAX_BATCHES_PER_NETWORK_MINUTE
      || (!lim.known && lim.new_per_net >= MAX_NEW_VISITORS_PER_NETWORK_HOUR)) {
      await countFiltered('rate');
      return send(res, 429, { error: 'rate' });
    }
    await query('INSERT INTO rate_hits (key) VALUES ($1)', [net]);
    if (!lim.known) await query('INSERT INTO rate_hits (key) VALUES ($1)', [`new:${net}`]);
    if (Math.random() < 0.02) await query("DELETE FROM rate_hits WHERE created_at < now() - interval '2 hours'");

    // A visitor record is only created by a real page view, never by a stray event.
    const isVisit = batch.events.some((e) => e.type === 'visit');
    if (!lim.known && !isVisit) { await countFiltered('invalid'); return send(res, 400, { error: 'no visit' }); }

    const m = batch.meta || {};
    await query(
      `INSERT INTO visitors (id, country, device, lang, referrer)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         last_seen = now(),
         visits    = LEAST(visitors.visits + CASE WHEN $6 THEN 1 ELSE 0 END, 100000),
         country   = COALESCE(EXCLUDED.country, visitors.country),
         device    = COALESCE(EXCLUDED.device, visitors.device),
         lang      = COALESCE(EXCLUDED.lang, visitors.lang),
         referrer  = COALESCE(visitors.referrer, EXCLUDED.referrer)`,
      [batch.vid, /^[A-Z]{2}$/.test(country) ? country : null, m.device ?? null, m.lang ?? null, m.referrer ?? null, isVisit],
    );

    if (batch.profile) {
      const p = batch.profile;
      await query(
        `UPDATE visitors SET name_enc = $2, role = $3, sound = $4, motion = $5, start_choice = $6, skipped = $7, theme = $8 WHERE id = $1`,
        [batch.vid, encrypt(p.name), p.role, p.sound, p.motion, p.start, p.skipped, p.theme],
      );
    }

    const values = [];
    const rows = batch.events.map((e, i) => {
      values.push(batch.vid, e.type, e.name, e.value);
      const o = i * 4;
      return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4})`;
    });
    await query(`INSERT INTO events (visitor_id, type, name, value) VALUES ${rows.join(', ')}`, values);
    return send(res, 204);
  } catch (e) {
    console.error('collect failed', e.message);
    return send(res, 500, { error: 'server' });
  }
}
