// Strict allowlist validation for everything the public site sends.
// Unknown fields are dropped; anything off-schema rejects the whole batch.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENUMS = {
  role: ['hiring', 'project', 'collab', 'explore'],
  sound: ['on', 'off'],
  motion: ['full', 'calm'],
  theme: ['dark', 'light'],
  start: ['#works', '#services', '#experience', '#insights', '#contact', '#top'],
  device: ['mobile', 'tablet', 'desktop'],
};
export const EVENT_TYPES = ['visit', 'launch', 'chapter', 'action', 'leave'];
const CHAPTERS = ['00', '01', '02', '03', '04', '05', '06', '07'];
const ACTIONS = ['pass', 'brief', 'resume', 'instagram', 'linkedin', 'phone', 'hud_cta', 'sound_on', 'sound_off', 'replay'];

const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max) : null);
const oneOf = (v, list) => (list.includes(v) ? v : null);

export function isUuid(v) { return typeof v === 'string' && UUID.test(v); }

// Referrer is reduced to its hostname — no paths, no query strings, no tracking params.
export function refHost(v) {
  if (typeof v !== 'string' || !v) return null;
  try { return new URL(v).hostname.replace(/^www\./, '').slice(0, 80) || null; } catch { return null; }
}

export function validateBatch(body) {
  if (!body || typeof body !== 'object') return { error: 'body' };
  const { vid, events } = body;
  const allowed = new Set(['vid', 'events', 'auto']);
  if (Object.keys(body).some((k) => !allowed.has(k))) return { error: 'fields' };
  if (!isUuid(vid)) return { error: 'vid' };
  if (!Array.isArray(events) || events.length === 0 || events.length > 20) return { error: 'events' };
  const out = [];
  let profile = null;
  let meta = null;
  for (const e of events) {
    if (!e || typeof e !== 'object' || !EVENT_TYPES.includes(e.type)) return { error: 'type' };
    if (e.type === 'visit') {
      meta = {
        device: oneOf(e.device, ENUMS.device),
        lang: clean(e.lang, 12),
        referrer: refHost(e.referrer),
      };
      out.push({ type: 'visit', name: null, value: null });
    } else if (e.type === 'launch') {
      profile = {
        name: clean(e.name, 24) || null,
        role: oneOf(e.role, ENUMS.role),
        sound: oneOf(e.sound, ENUMS.sound),
        motion: oneOf(e.motion, ENUMS.motion),
        theme: oneOf(e.theme, ENUMS.theme),
        start: oneOf(e.start, ENUMS.start),
        skipped: e.skipped === true,
      };
      out.push({ type: 'launch', name: profile.skipped ? 'skipped' : 'completed', value: null });
    } else if (e.type === 'chapter') {
      const ch = oneOf(e.name, CHAPTERS);
      if (!ch) return { error: 'chapter' };
      out.push({ type: 'chapter', name: ch, value: null });
    } else if (e.type === 'action') {
      const a = oneOf(e.name, ACTIONS);
      if (!a) return { error: 'action' };
      out.push({ type: 'action', name: a, value: null });
    } else if (e.type === 'leave') {
      const secs = Number.isFinite(e.seconds) ? Math.max(0, Math.min(Math.round(e.seconds), 7200)) : 0;
      const depth = Number.isFinite(e.depth) ? Math.max(0, Math.min(Math.round(e.depth), 100)) : 0;
      out.push({ type: 'leave', name: String(depth), value: secs });
    }
  }
  return { vid, events: out, profile, meta };
}
