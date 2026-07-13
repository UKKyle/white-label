const encoder = new TextEncoder();

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
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 210_000 }, key, 256);
  return `pbkdf2_sha256$210000$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPlatformPassword(password: string, stored: string) {
  const [scheme, iterations, saltText, expected] = stored.split('$');
  if (scheme !== 'pbkdf2_sha256' || !saltText || !expected || !Number.isInteger(Number(iterations))) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64Url(saltText), iterations: Number(iterations) }, key, 256);
  return toBase64Url(new Uint8Array(bits)) === expected;
}
