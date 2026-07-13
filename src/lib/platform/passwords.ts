const encoder = new TextEncoder();
// Cloudflare's current Web Crypto PBKDF2 implementation rejects counts above
// 100,000. Keep this explicit rather than silently clamping caller input.
export const PASSWORD_HASH_CONFIG = {
  algorithm: 'pbkdf2_sha256',
  version: 'v1',
  iterations: 100_000,
  saltBytes: 16,
  derivedKeyBytes: 32,
} as const;

function toBase64Url(bytes: Uint8Array) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64Url(value: string) {
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((value.length + 3) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function validatePlatformPassword(password: string) {
  if (password.length < 12) return 'Use at least 12 characters.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'Include upper-case, lower-case and a number.';
  }
  return null;
}

export async function hashPlatformPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_HASH_CONFIG.saltBytes));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_HASH_CONFIG.iterations }, key, PASSWORD_HASH_CONFIG.derivedKeyBytes * 8);
  return `${PASSWORD_HASH_CONFIG.algorithm}$${PASSWORD_HASH_CONFIG.version}$${PASSWORD_HASH_CONFIG.iterations}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPlatformPassword(password: string, stored: string) {
  const parts = stored.split('$');
  const versioned = parts.length === 5;
  const [scheme, version, iterationsText, saltText, expected] = versioned ? parts : [parts[0], 'legacy', parts[1], parts[2], parts[3]];
  const iterations = Number(iterationsText);
  if (scheme !== PASSWORD_HASH_CONFIG.algorithm || (versioned && version !== PASSWORD_HASH_CONFIG.version) || !saltText || !expected || !Number.isInteger(iterations) || iterations <= 0 || iterations > PASSWORD_HASH_CONFIG.iterations) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64Url(saltText), iterations }, key, PASSWORD_HASH_CONFIG.derivedKeyBytes * 8);
  return toBase64Url(new Uint8Array(bits)) === expected;
}
