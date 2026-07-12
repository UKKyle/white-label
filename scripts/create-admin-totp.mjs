import crypto from 'node:crypto';

const ISSUER = 'Baked By Mady';
const LABEL = 'Admin';
const SECRET_BYTES = 20;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function groupSecret(secret) {
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret;
}

function encodeOtpComponent(value) {
  return encodeURIComponent(value).replaceAll('%20', '+');
}

const secret = base32Encode(crypto.randomBytes(SECRET_BYTES));

const label = `${ISSUER}:${LABEL}`;
const otpauthUrl = [
  `otpauth://totp/${encodeOtpComponent(label)}`,
  `?secret=${secret}`,
  `&issuer=${encodeOtpComponent(ISSUER)}`,
  '&algorithm=SHA1',
  '&digits=6',
  '&period=30',
].join('');

console.log('\nAdd this to your uncommitted .env file and Cloudflare deployment secrets:\n');
console.log(`ADMIN_TOTP_SECRET="${secret}"`);

console.log('\nManual setup key for Ente Auth:\n');
console.log(groupSecret(secret));

console.log('\nEnte Auth settings:\n');
console.log(`Name: ${ISSUER} ${LABEL}`);
console.log('Type: TOTP');
console.log('Digits: 6');
console.log('Period: 30 seconds');
console.log('Algorithm: SHA1');

console.log('\nOptional otpauth setup URI:\n');
console.log(otpauthUrl);

console.log('\nDo not commit this value.\n');
