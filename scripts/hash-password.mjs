// Usage: npm run hash-password
// Prompts for your admin password (hidden) and prints the value for ADMIN_PASSWORD_HASH,
// plus fresh random SESSION_SECRET, CRON_SECRET and DATA_ENCRYPTION_KEY. Nothing is written to disk.
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../api/_lib/auth.js';

function ask(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    let value = '';
    const hidden = stdin.isTTY;
    if (hidden) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        if (hidden) stdin.setRawMode(false);
        stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); resolve(value);
      } else if (ch === '\u0003') { process.exit(1); }
      else if (ch === '\u007f' || ch === '\b') { value = value.slice(0, -1); }
      else { value += ch; }
    };
    stdin.on('data', onData);
  });
}

const pw = await ask('Admin password (min 12 characters): ');
if (pw.length < 12) { console.error('Password too short — use at least 12 characters.'); process.exit(1); }
const again = await ask('Repeat password: ');
if (pw !== again) { console.error('Passwords do not match.'); process.exit(1); }

console.log('\nAdd these in Vercel → Project → Settings → Environment Variables:\n');
console.log(`ADMIN_PASSWORD_HASH=${hashPassword(pw)}`);
console.log(`SESSION_SECRET=${randomBytes(32).toString('base64url')}`);
console.log(`CRON_SECRET=${randomBytes(24).toString('base64url')}`);
console.log(`DATA_ENCRYPTION_KEY=${randomBytes(32).toString('base64url')}`);
console.log('\nKeep DATA_ENCRYPTION_KEY safe: without it, stored visitor names cannot be read. Never change it once data exists.');
