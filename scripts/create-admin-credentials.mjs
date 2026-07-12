import { createInterface } from 'node:readline/promises';
import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { stdin as input, stdout as output } from 'node:process';

const ITERATIONS = 100000;
const KEY_LENGTH = 32;

function createPasswordHash(password, salt) {
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256').toString('base64url');
  return `pbkdf2_sha256$${ITERATIONS}$${salt}$${hash}`;
}

const rl = createInterface({ input, output });

try {
  output.write('Admin email allowlist (comma-separated): ');
  const emailAllowlist = (await rl.question('')).trim().toLowerCase();

  output.write('Admin password: ');
  const password = await rl.question('', { hideEchoBack: true });
  output.write('\n');

  if (!emailAllowlist) {
    throw new Error('Admin email allowlist is required.');
  }

  if (!password) {
    throw new Error('Admin password is required.');
  }

  const salt = randomBytes(16).toString('base64url');
  const passwordHash = createPasswordHash(password, salt);
  const sessionSecret = randomBytes(32).toString('base64url');

  output.write('\nAdd these values to your uncommitted .env file and deployment secrets:\n\n');
  output.write(`ADMIN_EMAIL_ALLOWLIST="${emailAllowlist}"\n`);
  output.write(`ADMIN_PASSWORD_HASH="${passwordHash}"\n`);
  output.write(`ADMIN_SESSION_SECRET="${sessionSecret}"\n`);
  output.write('\nDo not commit these values.\n');
} finally {
  rl.close();
}
