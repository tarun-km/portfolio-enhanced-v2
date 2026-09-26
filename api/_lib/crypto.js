// Field-level encryption for personal data (visitor names).
// AES-256-GCM with a random 96-bit IV per value; the key lives only in the
// DATA_ENCRYPTION_KEY environment variable, never in the database. A copy of the
// database alone therefore reveals no names.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key() {
  const raw = process.env.DATA_ENCRYPTION_KEY || '';
  const buf = Buffer.from(raw, 'base64url');
  if (buf.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes (base64url)');
  return buf;
}

export function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64url')}:${c.getAuthTag().toString('base64url')}:${ct.toString('base64url')}`;
}

export function decrypt(token) {
  if (!token) return null;
  try {
    const [v, iv, tag, ct] = token.split(':');
    if (v !== 'v1') return null;
    const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
  } catch { return null; } // tampered or wrong key → treated as unknown, never thrown to the client
}

export const cryptoReady = () => { try { key(); return true; } catch { return false; } };
