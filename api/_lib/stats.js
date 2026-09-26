// Aggregations for the dashboard. Pure SQL over the tables; `days` is a validated integer
// and the timezone is validated against the database's own list before use.
import { query } from './db.js';
import { decrypt } from './crypto.js';

export const RANGES = [7, 30, 90, 365];
// Days, weekdays and hours are bucketed in the owner's timezone, not UTC.
export const TZ = () => {
  const tz = process.env.ADMIN_TZ || 'Asia/Kolkata';
  return /^[A-Za-z]+(?:\/[A-Za-z_+-]+){0,2}$/.test(tz) ? tz : 'Asia/Kolkata';
};

export async function buildStats(days) {
  const tz = TZ();
  const [{ ok }] = await query('SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = $1) AS ok', [tz]);
  const zone = ok ? tz : 'UTC';
  const d = [days];
  const dz = [days, zone];
  const since = 'now() - make_interval(days => $1)';
  const prevSince = 'now() - make_interval(days => $1 * 2)';

  const [
    kpi, prev, daily, roles, sound, motion, theme, starts, chapters, actions,
    devices, countries, referrers, heat, engagement, launch, recent, filtered, live, freshness,
  ] = await Promise.all([
    query(`SELECT
        count(DISTINCT e.visitor_id)::int                                         AS visitors,
        count(*) FILTER (WHERE e.type = 'visit')::int                              AS visits,
        count(DISTINCT e.visitor_id) FILTER (WHERE v.first_seen > ${since})::int   AS new_visitors,
        count(*) FILTER (WHERE e.type = 'action')::int                             AS actions
      FROM events e JOIN visitors v ON v.id = e.visitor_id WHERE e.created_at > ${since}`, d),
    query(`SELECT count(DISTINCT visitor_id)::int AS visitors, count(*) FILTER (WHERE type = 'visit')::int AS visits,
        count(*) FILTER (WHERE type = 'action')::int AS actions
      FROM events WHERE created_at > ${prevSince} AND created_at <= ${since}`, d),
    query(`WITH days AS (
        SELECT generate_series((now() AT TIME ZONE $2)::date - ($1 - 1), (now() AT TIME ZONE $2)::date, interval '1 day')::date AS day
      )
      SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
        count(DISTINCT e.visitor_id)::int AS visitors,
        count(e.id) FILTER (WHERE e.type = 'visit')::int AS visits
      FROM days LEFT JOIN events e ON (e.created_at AT TIME ZONE $2)::date = days.day
      GROUP BY days.day ORDER BY days.day`, dz),
    query(`SELECT COALESCE(role, 'unknown') AS k, count(*)::int AS n FROM visitors WHERE last_seen > ${since} GROUP BY 1 ORDER BY 2 DESC`, d),
    query(`SELECT COALESCE(sound, 'unknown') AS k, count(*)::int AS n FROM visitors WHERE last_seen > ${since} GROUP BY 1 ORDER BY 2 DESC`, d),
    query(`SELECT COALESCE(motion, 'unknown') AS k, count(*)::int AS n FROM visitors WHERE last_seen > ${since} GROUP BY 1 ORDER BY 2 DESC`, d),
    query(`SELECT COALESCE(theme, 'unknown') AS k, count(*)::int AS n FROM visitors WHERE last_seen > ${since} GROUP BY 1 ORDER BY 2 DESC`, d),
    query(`SELECT COALESCE(start_choice, 'unknown') AS k, count(*)::int AS n FROM visitors WHERE last_seen > ${since} GROUP BY 1 ORDER BY 2 DESC`, d),
    query(`SELECT name AS k, count(DISTINCT visitor_id)::int AS n FROM events WHERE type = 'chapter' AND created_at > ${since} GROUP BY 1 ORDER BY 1`, d),
    query(`SELECT name AS k, count(*)::int AS n FROM events WHERE type = 'action' AND created_at > ${since} GROUP BY 1 ORDER BY 2 DESC`, d),
    query(`SELECT COALESCE(device, 'unknown') AS k, count(*)::int AS n FROM visitors WHERE last_seen > ${since} GROUP BY 1 ORDER BY 2 DESC`, d),
    query(`SELECT COALESCE(country, '??') AS k, count(*)::int AS n FROM visitors WHERE last_seen > ${since} GROUP BY 1 ORDER BY 2 DESC LIMIT 12`, d),
    query(`SELECT COALESCE(referrer, 'direct') AS k, count(*)::int AS n FROM visitors WHERE last_seen > ${since} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, d),
    query(`SELECT extract(isodow FROM created_at AT TIME ZONE $2)::int AS dow, extract(hour FROM created_at AT TIME ZONE $2)::int AS hr, count(*)::int AS n
      FROM events WHERE type = 'visit' AND created_at > ${since} GROUP BY 1, 2`, dz),
    query(`SELECT COALESCE(round(avg(value))::int, 0) AS avg_seconds, COALESCE(round(avg(name::int))::int, 0) AS avg_depth,
        COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY value)::int, 0) AS median_seconds, count(*)::int AS samples
      FROM events WHERE type = 'leave' AND created_at > ${since}`, d),
    query(`SELECT count(*) FILTER (WHERE name = 'completed')::int AS completed, count(*) FILTER (WHERE name = 'skipped')::int AS skipped
      FROM events WHERE type = 'launch' AND created_at > ${since}`, d),
    query(`SELECT v.id, v.name_enc, v.role, v.sound, v.motion, v.start_choice, v.country, v.device, v.referrer, v.visits,
        to_char(v.first_seen, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS first_seen, to_char(v.last_seen, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen,
        (SELECT count(*)::int FROM events e WHERE e.visitor_id = v.id AND e.type = 'action') AS actions,
        (SELECT max(e.name) FROM events e WHERE e.visitor_id = v.id AND e.type = 'chapter') AS furthest
      FROM visitors v WHERE v.last_seen > ${since} ORDER BY v.last_seen DESC LIMIT 50`, d),
    query(`SELECT reason AS k, sum(n)::int AS n FROM filtered WHERE day > current_date - $1::int GROUP BY 1 ORDER BY 2 DESC`, d),
    query(`SELECT count(DISTINCT visitor_id)::int AS now FROM events WHERE created_at > now() - interval '5 minutes'`),
    query(`SELECT to_char(max(created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_event, count(*)::int AS total_events FROM events`),
  ]);

  return {
    days,
    timezone: zone,
    generatedAt: new Date().toISOString(),
    kpi: kpi[0], prev: prev[0], daily,
    roles, sound, motion, theme, starts, chapters, actions, devices, countries, referrers,
    heat, engagement: engagement[0], launch: launch[0],
    recent: recent.map(({ name_enc: enc, ...r }) => ({ ...r, name: decrypt(enc) })),
    filtered, live: live[0].now, freshness: freshness[0],
  };
}
