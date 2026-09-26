// Small request/response helpers shared by every function.
export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body === undefined ? '' : JSON.stringify(body));
}

// Reads the raw body with a hard size cap (Vercel may have already parsed it).
export async function readJson(req, limit = 4096) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    if (JSON.stringify(req.body).length > limit) throw Object.assign(new Error('too large'), { status: 413 });
    return req.body;
  }
  let raw = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!raw && typeof req.on === 'function') {
    raw = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
        if (data.length > limit) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy?.(); }
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }
  if (raw.length > limit) throw Object.assign(new Error('too large'), { status: 413 });
  try { return JSON.parse(raw || '{}'); } catch { throw Object.assign(new Error('bad json'), { status: 400 }); }
}

// State-changing requests must come from this site (defence in depth on top of SameSite cookies).
export function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!origin) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

export const header = (req, name) => {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
};

export function clientIp(req) {
  const fwd = header(req, 'x-forwarded-for') || '';
  return fwd.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}
