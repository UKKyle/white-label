import { getAdapterEnv, type RuntimeContext, type RuntimeEnv } from './runtimeEnv';

const SESSION_COOKIE = 'bbm_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const LOGIN_RATE_LIMIT_MAX_FAILURES = 5;
const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 60 * 15;
const encoder = new TextEncoder();

const ADMIN_IDENTITY_ENV_NAMES = [
  'ADMIN_EMAIL_ALLOWLIST',
  'ADMIN_ALLOWED_EMAILS',
  'ADMIN_EMAIL',
  'ADMIN_USERNAME',
  'ADMIN_USER',
] as const;

const ADMIN_PASSWORD_ENV_NAMES = [
  'ADMIN_ACCESS_CODE',
  'ADMIN_PASSWORD',
  'ADMIN_PASSWORD_HASH',
  'ADMIN_SECRET',
  'ADMIN_LOGIN_SECRET',
] as const;

const ADMIN_SESSION_SECRET_ENV_NAMES = [
  'ADMIN_SESSION_SECRET',
  'SESSION_SECRET',
  'AUTH_SECRET',
] as const;

const ADMIN_TOTP_SECRET_ENV_NAMES = ['ADMIN_TOTP_SECRET'] as const;

type AdminContext = {
  request: Request;
} & RuntimeContext;

export type AdminSession = {
  email: string;
};

export type AdminLoginResult = {
  ok: boolean;
  rateLimited: boolean;
  reason: 'ok' | 'invalid' | 'rate_limited' | 'missing_config';
  configCode?: AdminConfigCode;
};

export type AdminConfigCode = 'identity' | 'password' | 'session' | 'totp';

type LoginAttemptRecord = {
  failedAttempts: number;
  firstFailedAt: number;
  lockoutUntil: number;
};

const loginAttemptStore = new Map<string, LoginAttemptRecord>();

function getRuntimeEnv(context?: RuntimeContext): RuntimeEnv {
  const adapterEnv = getAdapterEnv(context);

  function read(name: string) {
    const adapterValue = adapterEnv[name];

    if (typeof adapterValue === 'string') {
      return adapterValue;
    }

    return import.meta.env[name] as string | undefined;
  }

  return {
    ...adapterEnv,
    ADMIN_EMAIL_ALLOWLIST: read('ADMIN_EMAIL_ALLOWLIST'),
    ADMIN_ALLOWED_EMAILS: read('ADMIN_ALLOWED_EMAILS'),
    ADMIN_EMAIL: read('ADMIN_EMAIL'),
    ADMIN_USERNAME: read('ADMIN_USERNAME'),
    ADMIN_USER: read('ADMIN_USER'),
    ADMIN_ACCESS_CODE: read('ADMIN_ACCESS_CODE'),
    ADMIN_PASSWORD: read('ADMIN_PASSWORD'),
    ADMIN_PASSWORD_HASH: read('ADMIN_PASSWORD_HASH'),
    ADMIN_SECRET: read('ADMIN_SECRET'),
    ADMIN_LOGIN_SECRET: read('ADMIN_LOGIN_SECRET'),
    ADMIN_SESSION_SECRET: read('ADMIN_SESSION_SECRET'),
    ADMIN_TOTP_SECRET: read('ADMIN_TOTP_SECRET'),
    SESSION_SECRET: read('SESSION_SECRET'),
    AUTH_SECRET: read('AUTH_SECRET'),
    MODE: read('MODE') ?? import.meta.env.MODE,
    DEV: typeof adapterEnv.DEV === 'boolean' ? adapterEnv.DEV : import.meta.env.DEV,
    SESSION: adapterEnv.SESSION,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getClientIp(request: Request) {
  const cloudflareIp = request.headers.get('CF-Connecting-IP')?.trim();

  if (!cloudflareIp || cloudflareIp.length > 64 || cloudflareIp.includes(',')) {
    return undefined;
  }

  return cloudflareIp;
}

function getLoginAttemptKey(email: string, request: Request) {
  const normalizedEmail = normalizeEmail(email);
  const clientIp = getClientIp(request);

  return clientIp ? `${normalizedEmail}::${clientIp}` : `${normalizedEmail}::no-ip`;
}

function getNamedSecret(env: RuntimeEnv, names: readonly string[]) {
  for (const name of names) {
    const value = env[name];

    if (typeof value === 'string' && value.trim()) {
      return { name, value: value.trim() };
    }
  }

  return { name: undefined, value: undefined };
}

function hasNamedSecret(env: RuntimeEnv, names: readonly string[]) {
  return names.some((name) => typeof env[name] === 'string' && Boolean((env[name] as string).trim()));
}

function getAllowlist(env: RuntimeEnv) {
  const identitySecret = getNamedSecret(env, ADMIN_IDENTITY_ENV_NAMES);

  return (identitySecret.value ?? '')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean);
}

export function isAdminAllowed(email: string, context?: RuntimeContext) {
  const allowlist = getAllowlist(getRuntimeEnv(context));

  return allowlist.length > 0 && allowlist.includes(normalizeEmail(email));
}

function getSessionSecret(env: RuntimeEnv) {
  const secret = getNamedSecret(env, ADMIN_SESSION_SECRET_ENV_NAMES).value;

  return secret && secret.length >= 32 ? secret : undefined;
}

function getAccessCode(env: RuntimeEnv) {
  const accessCode = getNamedSecret(env, ['ADMIN_ACCESS_CODE']);

  return accessCode.value || undefined;
}

function getLegacyAdminPassword(env: RuntimeEnv) {
  return getNamedSecret(env, ['ADMIN_PASSWORD', 'ADMIN_SECRET', 'ADMIN_LOGIN_SECRET']).value || undefined;
}

function getAdminPasswordHash(env: RuntimeEnv) {
  const passwordHash = getNamedSecret(env, ['ADMIN_PASSWORD_HASH']);

  return passwordHash.value || undefined;
}

function getAdminTotpSecret(env: RuntimeEnv) {
  const totpSecret = getNamedSecret(env, ADMIN_TOTP_SECRET_ENV_NAMES);

  return totpSecret.value || undefined;
}

function logAdminConfigDiagnostics(env: RuntimeEnv) {
  const identitySecret = getNamedSecret(env, ADMIN_IDENTITY_ENV_NAMES);
  const passwordSecret = getNamedSecret(env, ADMIN_PASSWORD_ENV_NAMES);
  const rawSessionSecret = getNamedSecret(env, ADMIN_SESSION_SECRET_ENV_NAMES);
  const totpSecret = getNamedSecret(env, ADMIN_TOTP_SECRET_ENV_NAMES);

  console.warn('admin_login_config_state', {
    checked: {
      adminIdentity: ADMIN_IDENTITY_ENV_NAMES,
      adminPassword: ADMIN_PASSWORD_ENV_NAMES,
      sessionSecret: ADMIN_SESSION_SECRET_ENV_NAMES,
      sessionBinding: ['SESSION'],
      csrfSecret: ADMIN_SESSION_SECRET_ENV_NAMES,
      totpSecret: ADMIN_TOTP_SECRET_ENV_NAMES,
    },
    present: {
      adminIdentity: Boolean(identitySecret.value),
      adminPassword: Boolean(passwordSecret.value),
      sessionSecret: Boolean(rawSessionSecret.value),
      sessionSecretUsable: Boolean(getSessionSecret(env)),
      sessionBinding: Boolean(env.SESSION),
      totpSecret: Boolean(totpSecret.value),
    },
    selected: {
      adminIdentity: identitySecret.name,
      adminPassword: passwordSecret.name,
      sessionSecret: rawSessionSecret.name,
      csrfSecret: rawSessionSecret.name,
      totpSecret: totpSecret.name,
    },
  });
}

function base64UrlEncode(input: ArrayBuffer | string) {
  const bytes = typeof input === 'string' ? encoder.encode(input) : new Uint8Array(input);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function base64UrlDecode(input: string) {
  const padded = input.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((input.length + 3) % 4);

  return atob(padded);
}

function base64UrlDecodeBytes(input: string) {
  const binary = base64UrlDecode(input);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function hmacSha256(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));

  return base64UrlEncode(signature);
}

function timingSafeEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    const leftCode = left.charCodeAt(index) || 0;
    const rightCode = right.charCodeAt(index) || 0;

    mismatch |= leftCode ^ rightCode;
  }

  return mismatch === 0;
}

function verifyAccessCode(input: string, accessCode: string) {
  return timingSafeEqual(input.trim(), accessCode);
}

async function verifyPasswordHash(input: string, passwordHash: string) {
  const [scheme, iterationsText, salt, expectedHash] = passwordHash.split('$');
  const iterations = Number(iterationsText);

  if (
    scheme !== 'pbkdf2_sha256' ||
    !Number.isInteger(iterations) ||
    iterations <= 0 ||
    !salt ||
    !expectedHash
  ) {
    console.warn('admin_login_secret_invalid', { secretType: 'ADMIN_PASSWORD_HASH' });
    return false;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(input),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const saltCandidates: Uint8Array[] = [encoder.encode(salt)];

  try {
    saltCandidates.push(base64UrlDecodeBytes(salt));
  } catch {
    // Older hashes use the salt text directly; invalid base64url here is harmless.
  }

  for (const candidateSalt of saltCandidates) {
    const candidateSaltBuffer = candidateSalt.buffer.slice(
      candidateSalt.byteOffset,
      candidateSalt.byteOffset + candidateSalt.byteLength
    ) as ArrayBuffer;

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: candidateSaltBuffer,
        iterations,
      },
      key,
      256
    );

    if (timingSafeEqual(base64UrlEncode(derivedBits), expectedHash)) {
      return true;
    }
  }

  return false;
}

function normalizeTotpCode(input: string) {
  return input.replaceAll(/\D/g, '').slice(0, 6);
}

function normalizeBase32(input: string) {
  return input.toUpperCase().replaceAll(/[^A-Z2-7]/g, '');
}

function base32Decode(input: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = normalizeBase32(input);
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const character of normalized) {
    const index = alphabet.indexOf(character);

    if (index === -1) {
      throw new Error('Invalid Base32 TOTP secret.');
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

function counterToBytes(counter: number) {
  const bytes = new Uint8Array(8);
  let value = counter;

  for (let index = 7; index >= 0; index -= 1) {
    bytes[index] = value & 255;
    value = Math.floor(value / 256);
  }

  return bytes;
}

async function createTotpCode(secret: string, counter: number) {
  const secretBytes = base32Decode(secret);

  if (secretBytes.length < 10) {
    console.warn('admin_totp_secret_invalid', { reason: 'too_short' });
    return undefined;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterToBytes(counter)));
  const offset = signature[signature.length - 1] & 15;

  const binary =
    ((signature[offset] & 127) << 24) |
    ((signature[offset + 1] & 255) << 16) |
    ((signature[offset + 2] & 255) << 8) |
    (signature[offset + 3] & 255);

  return String(binary % 1_000_000).padStart(6, '0');
}

async function verifyTotpCode(input: string, secret: string) {
  const code = normalizeTotpCode(input);

  if (code.length !== 6) {
    return false;
  }

  const currentCounter = Math.floor(Date.now() / 1000 / 30);
  const allowedWindow = [-1, 0, 1];

  for (const windowOffset of allowedWindow) {
    const expectedCode = await createTotpCode(secret, currentCounter + windowOffset);

    if (expectedCode && timingSafeEqual(code, expectedCode)) {
      return true;
    }
  }

  return false;
}

async function verifyAdminPassword(input: string, env: RuntimeEnv) {
  const accessCode = getAccessCode(env);

  if (accessCode && verifyAccessCode(input, accessCode)) {
    return true;
  }

  const legacyPassword = getLegacyAdminPassword(env);

  if (legacyPassword && timingSafeEqual(input, legacyPassword)) {
    return true;
  }

  const passwordHash = getAdminPasswordHash(env);

  if (passwordHash && (await verifyPasswordHash(input, passwordHash))) {
    return true;
  }

  return false;
}

async function createSessionCookie(email: string, env: RuntimeEnv) {
  const secret = getSessionSecret(env);

  if (!secret) {
    throw new Error('Admin session secret is not configured');
  }

  const payload = {
    email: normalizeEmail(email),
    iat: getNowInSeconds(),
    exp: getNowInSeconds() + SESSION_TTL_SECONDS,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacSha256(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

function readCookie(request: Request, name: string) {
  const cookies = request.headers.get('Cookie') ?? '';
  const match = cookies
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

function getAdminSessionCookieValue(request: Request) {
  return readCookie(request, SESSION_COOKIE);
}

function isProduction(env: RuntimeEnv) {
  return env.MODE === 'production' || env.DEV === false;
}

function cookieAttributes(env: RuntimeEnv, maxAge: number) {
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];

  if (isProduction(env)) {
    parts.push('Secure');
  }

  return parts;
}

function getNowInSeconds() {
  return Math.floor(Date.now() / 1000);
}

function readLoginAttemptRecord(key: string, now: number) {
  const record = loginAttemptStore.get(key);

  if (!record) {
    return null;
  }

  const windowExpired = now - record.firstFailedAt >= LOGIN_RATE_LIMIT_WINDOW_SECONDS;
  const lockoutExpired = record.lockoutUntil > 0 && record.lockoutUntil <= now;

  if ((windowExpired && record.lockoutUntil === 0) || (windowExpired && lockoutExpired)) {
    loginAttemptStore.delete(key);
    return null;
  }

  if (lockoutExpired) {
    loginAttemptStore.delete(key);
    return null;
  }

  return record;
}

function isLoginRateLimited(email: string, request: Request) {
  const key = getLoginAttemptKey(email, request);
  const now = getNowInSeconds();
  const record = readLoginAttemptRecord(key, now);

  return Boolean(
    record &&
      record.lockoutUntil > now &&
      record.failedAttempts >= LOGIN_RATE_LIMIT_MAX_FAILURES
  );
}

function registerFailedLoginAttempt(email: string, request: Request) {
  const key = getLoginAttemptKey(email, request);
  const now = getNowInSeconds();
  const record = readLoginAttemptRecord(key, now);

  if (!record) {
    loginAttemptStore.set(key, {
      failedAttempts: 1,
      firstFailedAt: now,
      lockoutUntil: 0,
    });

    return;
  }

  const nextFailedAttempts = record.failedAttempts + 1;
  const shouldLock = nextFailedAttempts >= LOGIN_RATE_LIMIT_MAX_FAILURES;

  loginAttemptStore.set(key, {
    failedAttempts: nextFailedAttempts,
    firstFailedAt: record.firstFailedAt,
    lockoutUntil: shouldLock ? now + LOGIN_RATE_LIMIT_WINDOW_SECONDS : 0,
  });
}

function clearFailedLoginAttempts(email: string, request: Request) {
  const key = getLoginAttemptKey(email, request);

  loginAttemptStore.delete(key);
}

export async function buildAdminSessionCookie(email: string, context?: RuntimeContext) {
  const env = getRuntimeEnv(context);
  const sessionValue = await createSessionCookie(email, env);
  const parts = cookieAttributes(env, SESSION_TTL_SECONDS);

  parts[0] = `${SESSION_COOKIE}=${encodeURIComponent(sessionValue)}`;

  return parts.join('; ');
}

export function buildClearAdminSessionCookie(context?: RuntimeContext) {
  const env = getRuntimeEnv(context);

  return cookieAttributes(env, 0).join('; ');
}

export async function authenticateAdminLogin(
  email: string,
  password: string,
  totp: string,
  context: AdminContext
): Promise<AdminLoginResult> {
  const env = getRuntimeEnv(context);
  const normalizedEmail = normalizeEmail(email);
  const allowlist = getAllowlist(env);
  const sessionSecret = getSessionSecret(env);
  const accessCode = getAccessCode(env);
  const legacyPassword = getLegacyAdminPassword(env);
  const passwordHash = getAdminPasswordHash(env);
  const totpSecret = getAdminTotpSecret(env);
  const rawSessionSecretPresent = hasNamedSecret(env, ADMIN_SESSION_SECRET_ENV_NAMES);

  logAdminConfigDiagnostics(env);

  if (!sessionSecret) {
    console.warn('admin_login_config_missing', {
      missing: rawSessionSecretPresent ? 'USABLE_ADMIN_SESSION_SECRET' : 'ADMIN_SESSION_SECRET',
      checked: ADMIN_SESSION_SECRET_ENV_NAMES,
    });
  }

  if (!accessCode && !legacyPassword && !passwordHash) {
    console.warn('admin_login_config_missing', {
      missing: 'ADMIN_PASSWORD_SECRET',
      checked: ADMIN_PASSWORD_ENV_NAMES,
    });
  }

  if (allowlist.length === 0) {
    console.warn('admin_login_config_missing', {
      missing: 'ADMIN_IDENTITY',
      checked: ADMIN_IDENTITY_ENV_NAMES,
    });
  }

  if (!totpSecret) {
    console.warn('admin_login_config_missing', {
      missing: 'ADMIN_TOTP_SECRET',
      checked: ADMIN_TOTP_SECRET_ENV_NAMES,
    });
  }

  if (!sessionSecret || (!accessCode && !legacyPassword && !passwordHash) || allowlist.length === 0 || !totpSecret) {
    const configCode: AdminConfigCode = !sessionSecret
      ? 'session'
      : !accessCode && !legacyPassword && !passwordHash
        ? 'password'
        : allowlist.length === 0
          ? 'identity'
          : 'totp';

    return { ok: false, rateLimited: false, reason: 'missing_config', configCode };
  }

  if (isLoginRateLimited(normalizedEmail, context.request)) {
    return { ok: false, rateLimited: true, reason: 'rate_limited' };
  }

  const emailAllowed = allowlist.includes(normalizedEmail);

  if (!emailAllowed) {
    registerFailedLoginAttempt(normalizedEmail, context.request);

    return { ok: false, rateLimited: false, reason: 'invalid' };
  }

  const passwordOk = await verifyAdminPassword(password, env);

  if (!passwordOk) {
    console.warn('admin_login_rejected', { reason: 'invalid_password' });
    registerFailedLoginAttempt(normalizedEmail, context.request);

    return { ok: false, rateLimited: false, reason: 'invalid' };
  }

  const totpOk = await verifyTotpCode(totp, totpSecret);

  if (!totpOk) {
    console.warn('admin_login_rejected', { reason: 'invalid_totp' });
    registerFailedLoginAttempt(normalizedEmail, context.request);

    return { ok: false, rateLimited: false, reason: 'invalid' };
  }

  clearFailedLoginAttempts(normalizedEmail, context.request);

  return { ok: true, rateLimited: false, reason: 'ok' };
}

export async function getAdminSession(context: AdminContext): Promise<AdminSession | null> {
  try {
    const env = getRuntimeEnv(context);
    const secret = getSessionSecret(env);
    const sessionCookie = readCookie(context.request, SESSION_COOKIE);

    if (!secret || !sessionCookie) {
      return null;
    }

    const [encodedPayload, signature] = sessionCookie.split('.');

    if (!encodedPayload || !signature) {
      return null;
    }

    const expectedSignature = await hmacSha256(encodedPayload, secret);

    if (signature !== expectedSignature) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const email = typeof payload.email === 'string' ? normalizeEmail(payload.email) : '';
    const iat = typeof payload.iat === 'number' ? payload.iat : 0;
    const exp = typeof payload.exp === 'number' ? payload.exp : 0;

    if (!email || iat <= 0 || exp < getNowInSeconds() || !isAdminAllowed(email, context)) {
      return null;
    }

    return { email };
  } catch {
    return null;
  }
}

export async function requireAdminSession(context: AdminContext) {
  const session = await getAdminSession(context);

  if (!session) {
    return {
      session: null,
      response: new Response(null, {
        status: 302,
        headers: {
          Location: '/admin/login',
        },
      }),
    };
  }

  return { session, response: null };
}

export async function createAdminCsrfToken(context: AdminContext, session: AdminSession) {
  const env = getRuntimeEnv(context);
  const secret = getSessionSecret(env);
  const sessionCookie = getAdminSessionCookieValue(context.request);

  if (!secret || !sessionCookie) {
    throw new Error('Unable to create CSRF token for admin session.');
  }

  return hmacSha256(`csrf:${session.email}:${sessionCookie}`, secret);
}

export async function validateAdminCsrfToken(
  context: AdminContext,
  session: AdminSession,
  token: string | null | undefined
) {
  if (!token) {
    return false;
  }

  const expected = await createAdminCsrfToken(context, session);

  return timingSafeEqual(token, expected);
}

export function isTrustedAdminOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get('Origin');

  if (origin) {
    return origin === requestUrl.origin;
  }

  const referer = request.headers.get('Referer');

  return referer ? referer.startsWith(requestUrl.origin) : false;
}
