import { isEmail, sanitizeEmail, sanitizeText } from '../security/sanitize';
import { upsertCustomerSignup } from './customerStore';
import { getOrderByReference, listOrderRecords, saveOrderRecord, type OrderRecord } from './orderStore';
import type { RuntimeContext, RuntimeEnv } from './runtimeEnv';

const ACCOUNT_COOKIE = 'crumb_customer_session';
const ACCOUNT_KEY_PREFIX = 'bbm:accounts:record:';
const ACCOUNT_EMAIL_KEY_PREFIX = 'bbm:accounts:email:';
const ACCOUNT_SESSION_KEY_PREFIX = 'bbm:accounts:session:';
const ACCOUNT_TOKEN_KEY_PREFIX = 'bbm:accounts:token:';
const ACCOUNT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const ACCOUNT_SESSION_IDLE_SECONDS = 60 * 60 * 8;
const VERIFY_TOKEN_TTL_SECONDS = 60 * 15;
const RESET_TOKEN_TTL_SECONDS = 60 * 30;
const PASSWORD_ITERATIONS = 100_000;
const PASSWORD_SALT_BYTES = 16;
const TOKEN_BYTES = 32;
const encoder = new TextEncoder();

type KVListResult = {
  cursor?: string;
  list_complete?: boolean;
  keys: Array<{ name: string }>;
};

type KVNamespaceLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string }): Promise<KVListResult>;
};

export type CustomerAccount = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  emailNormalized: string;
  emailVerified: boolean;
  emailVerifiedAt?: string;
  passwordHash: string;
  passwordUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  status: 'active' | 'disabled';
};

type CustomerSession = {
  tokenHash: string;
  accountId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

type AccountToken = {
  tokenHash: string;
  accountId: string;
  purpose: 'verify' | 'reset' | 'verify_code';
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
};

export type AccountSession = {
  account: CustomerAccount;
  session: CustomerSession;
};

export type CreateAccountResult = {
  account: CustomerAccount | null;
  verificationCode?: string;
  created: boolean;
};

function isKvNamespace(value: unknown): value is KVNamespaceLike {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as KVNamespaceLike).get === 'function' &&
      typeof (value as KVNamespaceLike).put === 'function' &&
      typeof (value as KVNamespaceLike).delete === 'function' &&
      typeof (value as KVNamespaceLike).list === 'function'
  );
}

function getBinding(env: RuntimeEnv) {
  if (isKvNamespace(env.ORDERS)) return env.ORDERS;
  return isKvNamespace(env.SESSION) ? env.SESSION : null;
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlDecode(value: string) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function timingSafeEqual(left: string, right: string) {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let diff = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }
  return diff === 0;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return base64UrlEncode(new Uint8Array(digest));
}

function randomToken(bytes = TOKEN_BYTES) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return base64UrlEncode(data);
}

function randomVerificationCode() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const value = new DataView(bytes.buffer).getUint32(0);
  return String(value % 1_000_000).padStart(6, '0');
}

function normaliseEmail(value: unknown) {
  return sanitizeEmail(value);
}

function accountKey(id: string) {
  return `${ACCOUNT_KEY_PREFIX}${id}`;
}

function accountEmailKey(email: string) {
  return `${ACCOUNT_EMAIL_KEY_PREFIX}${encodeURIComponent(email)}`;
}

function sessionKey(tokenHash: string) {
  return `${ACCOUNT_SESSION_KEY_PREFIX}${tokenHash}`;
}

function tokenKey(tokenHash: string) {
  return `${ACCOUNT_TOKEN_KEY_PREFIX}${tokenHash}`;
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function normaliseAccount(value: unknown): CustomerAccount | null {
  const account = value && typeof value === 'object' ? value as Partial<CustomerAccount> : {};
  const emailNormalized = normaliseEmail(account.emailNormalized || account.email);
  if (!account.id || !emailNormalized || !account.passwordHash) return null;
  return {
    id: sanitizeText(account.id).slice(0, 80),
    firstName: sanitizeText(account.firstName).slice(0, 80),
    lastName: sanitizeText(account.lastName).slice(0, 80),
    phone: sanitizeText(account.phone).slice(0, 40),
    email: emailNormalized,
    emailNormalized,
    emailVerified: account.emailVerified === true,
    emailVerifiedAt: typeof account.emailVerifiedAt === 'string' ? account.emailVerifiedAt : undefined,
    passwordHash: String(account.passwordHash),
    passwordUpdatedAt: typeof account.passwordUpdatedAt === 'string' ? account.passwordUpdatedAt : new Date().toISOString(),
    createdAt: typeof account.createdAt === 'string' ? account.createdAt : new Date().toISOString(),
    updatedAt: typeof account.updatedAt === 'string' ? account.updatedAt : new Date().toISOString(),
    lastLoginAt: typeof account.lastLoginAt === 'string' ? account.lastLoginAt : undefined,
    status: account.status === 'disabled' ? 'disabled' : 'active',
  };
}

function normaliseSession(value: unknown): CustomerSession | null {
  const session = value && typeof value === 'object' ? value as Partial<CustomerSession> : {};
  if (!session.tokenHash || !session.accountId || !session.expiresAt || !session.lastSeenAt) return null;
  return {
    tokenHash: String(session.tokenHash),
    accountId: sanitizeText(session.accountId).slice(0, 80),
    createdAt: typeof session.createdAt === 'string' ? session.createdAt : new Date().toISOString(),
    lastSeenAt: String(session.lastSeenAt),
    expiresAt: String(session.expiresAt),
  };
}

function normaliseToken(value: unknown): AccountToken | null {
  const token = value && typeof value === 'object' ? value as Partial<AccountToken> : {};
  if (!token.tokenHash || !token.accountId || !token.purpose || !token.expiresAt) return null;
  if (token.purpose !== 'verify' && token.purpose !== 'reset' && token.purpose !== 'verify_code') return null;
  return {
    tokenHash: String(token.tokenHash),
    accountId: sanitizeText(token.accountId).slice(0, 80),
    purpose: token.purpose,
    createdAt: typeof token.createdAt === 'string' ? token.createdAt : new Date().toISOString(),
    expiresAt: String(token.expiresAt),
    usedAt: typeof token.usedAt === 'string' ? token.usedAt : undefined,
  };
}

export function validateAccountPassword(password: string) {
  if (password.length < 10) return 'Use at least 10 characters.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) return 'Use uppercase and lowercase letters.';
  if (!/\d/.test(password)) return 'Include at least one number.';
  return '';
}

export function normaliseAccountName(value: unknown) {
  return sanitizeText(value).replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function normaliseAccountPhone(value: unknown) {
  return sanitizeText(value).replace(/[^\d+()\s.-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

export function validateAccountProfile(input: { firstName: string; lastName: string; phone: string }) {
  if (!input.firstName || input.firstName.length > 80) return 'Enter your first name.';
  if (!input.lastName || input.lastName.length > 80) return 'Enter your last name.';
  const digits = input.phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return 'Enter a valid phone number.';
  return '';
}

export async function hashPassword(password: string) {
  const salt = new Uint8Array(PASSWORD_SALT_BYTES);
  crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS },
    key,
    256
  );
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${base64UrlEncode(salt)}$${base64UrlEncode(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterationsRaw, saltRaw, hashRaw] = storedHash.split('$');
  if (algorithm !== 'pbkdf2-sha256' || !iterationsRaw || !saltRaw || !hashRaw) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations < 100_000) return false;
  const salt = base64UrlDecode(saltRaw);
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256
  );
  return timingSafeEqual(base64UrlEncode(new Uint8Array(bits)), hashRaw);
}

export async function getAccountById(env: RuntimeEnv, id: string) {
  const binding = getBinding(env);
  if (!binding) return null;
  return normaliseAccount(safeJsonParse(await binding.get(accountKey(id))));
}

export async function getAccountByEmail(env: RuntimeEnv, email: string) {
  const binding = getBinding(env);
  const emailNormalized = normaliseEmail(email);
  if (!binding || !emailNormalized) return null;
  const id = await binding.get(accountEmailKey(emailNormalized));
  return id ? getAccountById(env, id) : null;
}

async function saveAccount(env: RuntimeEnv, account: CustomerAccount) {
  const binding = getBinding(env);
  if (!binding) throw new Error('Customer account storage is not configured.');
  await binding.put(accountKey(account.id), JSON.stringify(account));
  await binding.put(accountEmailKey(account.emailNormalized), account.id);
}

export async function syncAccountToCustomerRecord(env: RuntimeEnv, account: CustomerAccount, marketingOptIn = false) {
  await upsertCustomerSignup(env, {
    email: account.emailNormalized,
    name: [account.firstName, account.lastName].filter(Boolean).join(' '),
    phone: account.phone,
    marketingOptIn,
    preserveExistingMarketingOptIn: true,
    countSignup: false,
    source: 'customer_account',
  });
}

export async function listCustomerAccounts(env: RuntimeEnv) {
  const binding = getBinding(env);
  if (!binding) return [];

  const accounts: CustomerAccount[] = [];
  let cursor: string | undefined;

  do {
    const result = await binding.list({ prefix: ACCOUNT_KEY_PREFIX, cursor });
    cursor = result.list_complete ? undefined : result.cursor;

    for (const key of result.keys) {
      const account = normaliseAccount(safeJsonParse(await binding.get(key.name)));
      if (account) accounts.push(account);
    }
  } while (cursor);

  return accounts.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function createCustomerAccount(env: RuntimeEnv, input: { firstName: string; lastName: string; phone: string; email: string; password: string; marketingOptIn?: boolean }): Promise<CreateAccountResult> {
  const emailNormalized = normaliseEmail(input.email);
  const firstName = normaliseAccountName(input.firstName);
  const lastName = normaliseAccountName(input.lastName);
  const phone = normaliseAccountPhone(input.phone);
  if (!emailNormalized || !isEmail(emailNormalized)) return { account: null, created: false };
  if (validateAccountProfile({ firstName, lastName, phone })) return { account: null, created: false };
  if (validateAccountPassword(input.password)) return { account: null, created: false };

  const existing = await getAccountByEmail(env, emailNormalized);
  if (existing) {
    if (!existing.emailVerified) {
      const updated = { ...existing, firstName, lastName, phone, passwordHash: await hashPassword(input.password), passwordUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await saveAccount(env, updated);
      await syncAccountToCustomerRecord(env, updated, input.marketingOptIn === true);
      const verificationCode = await createVerificationCode(env, updated.id);
      return { account: updated, verificationCode, created: false };
    }
    return { account: existing, created: false };
  }

  const now = new Date().toISOString();
  const account: CustomerAccount = {
    id: `acct_${randomToken(18)}`,
    firstName,
    lastName,
    phone,
    email: emailNormalized,
    emailNormalized,
    emailVerified: false,
    passwordHash: await hashPassword(input.password),
    passwordUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
    status: 'active',
  };
  await saveAccount(env, account);
  await syncAccountToCustomerRecord(env, account, input.marketingOptIn === true);
  const verificationCode = await createVerificationCode(env, account.id);
  return { account, verificationCode, created: true };
}

async function invalidateAccountTokens(env: RuntimeEnv, accountId: string, purpose: AccountToken['purpose']) {
  const binding = getBinding(env);
  if (!binding) return;
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const result = await binding.list({ prefix: ACCOUNT_TOKEN_KEY_PREFIX, cursor });
    cursor = result.list_complete ? undefined : result.cursor;
    keys.push(...result.keys.map((key) => key.name));
  } while (cursor);
  for (const key of keys) {
    const record = normaliseToken(safeJsonParse(await binding.get(key)));
    if (record?.accountId === accountId && record.purpose === purpose && !record.usedAt) {
      await binding.put(key, JSON.stringify({ ...record, usedAt: new Date().toISOString() }), { expirationTtl: 60 });
    }
  }
}

export async function createAccountToken(env: RuntimeEnv, accountId: string, purpose: AccountToken['purpose']) {
  const binding = getBinding(env);
  if (!binding) throw new Error('Customer account storage is not configured.');
  const token = randomToken();
  const tokenHash = await sha256(`${purpose}:${token}`);
  const now = new Date();
  const ttl = purpose === 'verify' ? VERIFY_TOKEN_TTL_SECONDS : RESET_TOKEN_TTL_SECONDS;
  const record: AccountToken = {
    tokenHash,
    accountId,
    purpose,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
  };
  await binding.put(tokenKey(tokenHash), JSON.stringify(record), { expirationTtl: ttl + 60 });
  return token;
}

export async function createVerificationCode(env: RuntimeEnv, accountId: string) {
  const binding = getBinding(env);
  if (!binding) throw new Error('Customer account storage is not configured.');
  await invalidateAccountTokens(env, accountId, 'verify_code');
  const code = randomVerificationCode();
  const tokenHash = await sha256(`verify_code:${accountId}:${code}`);
  const now = new Date();
  const record: AccountToken = {
    tokenHash,
    accountId,
    purpose: 'verify_code',
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + VERIFY_TOKEN_TTL_SECONDS * 1000).toISOString(),
  };
  await binding.put(tokenKey(tokenHash), JSON.stringify(record), { expirationTtl: VERIFY_TOKEN_TTL_SECONDS + 60 });
  return code;
}

export async function consumeAccountToken(env: RuntimeEnv, token: string, purpose: AccountToken['purpose']) {
  const binding = getBinding(env);
  if (!binding || !token) return null;
  const tokenHash = await sha256(`${purpose}:${token}`);
  const record = normaliseToken(safeJsonParse(await binding.get(tokenKey(tokenHash))));
  if (!record || record.purpose !== purpose || record.usedAt || new Date(record.expiresAt).getTime() <= Date.now()) return null;
  const account = await getAccountById(env, record.accountId);
  if (!account || account.status !== 'active') return null;
  await binding.put(tokenKey(tokenHash), JSON.stringify({ ...record, usedAt: new Date().toISOString() }), { expirationTtl: 60 });
  return account;
}

export async function verifyCustomerAccount(env: RuntimeEnv, token: string) {
  const account = await consumeAccountToken(env, token, 'verify');
  if (!account) return null;
  const now = new Date().toISOString();
  const next = {
    ...account,
    emailVerified: true,
    emailVerifiedAt: account.emailVerifiedAt ?? now,
    updatedAt: now,
  };
  await saveAccount(env, next);
  await linkHistoricalOrdersForAccount(env, next);
  return next;
}

export async function verifyCustomerAccountCode(env: RuntimeEnv, email: string, code: string) {
  const account = await getAccountByEmail(env, email);
  const normalisedCode = String(code || '').trim();
  const binding = getBinding(env);
  if (!binding || !account || account.status !== 'active' || account.emailVerified || !/^\d{6}$/.test(normalisedCode)) return null;
  const tokenHash = await sha256(`verify_code:${account.id}:${normalisedCode}`);
  const record = normaliseToken(safeJsonParse(await binding.get(tokenKey(tokenHash))));
  if (!record || record.purpose !== 'verify_code' || record.usedAt || new Date(record.expiresAt).getTime() <= Date.now()) return null;
  await binding.put(tokenKey(tokenHash), JSON.stringify({ ...record, usedAt: new Date().toISOString() }), { expirationTtl: 60 });
  const now = new Date().toISOString();
  const next = {
    ...account,
    emailVerified: true,
    emailVerifiedAt: now,
    updatedAt: now,
  };
  await saveAccount(env, next);
  await linkHistoricalOrdersForAccount(env, next);
  return next;
}

export async function createCustomerSession(env: RuntimeEnv, account: CustomerAccount) {
  const binding = getBinding(env);
  if (!binding) throw new Error('Customer account storage is not configured.');
  const token = randomToken();
  const tokenHash = await sha256(`session:${token}`);
  const now = new Date();
  const session: CustomerSession = {
    tokenHash,
    accountId: account.id,
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ACCOUNT_SESSION_TTL_SECONDS * 1000).toISOString(),
  };
  await binding.put(sessionKey(tokenHash), JSON.stringify(session), { expirationTtl: ACCOUNT_SESSION_TTL_SECONDS + 60 });
  await saveAccount(env, { ...account, lastLoginAt: now.toISOString(), updatedAt: now.toISOString() });
  return { token, session };
}

function readCookie(request: Request, name: string) {
  return (request.headers.get('Cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function isProduction(env: RuntimeEnv) {
  return env.MODE === 'production' || env.DEV === false;
}

export function buildCustomerSessionCookie(env: RuntimeEnv, token: string, maxAge = ACCOUNT_SESSION_TTL_SECONDS) {
  return [
    `${ACCOUNT_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    isProduction(env) ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

export function buildClearCustomerSessionCookie(env: RuntimeEnv) {
  return buildCustomerSessionCookie(env, '', 0);
}

export async function getCustomerSession(context: { request: Request } & RuntimeContext): Promise<AccountSession | null> {
  const env = context.locals ? (await import('./runtimeEnv')).getAdapterEnv(context) : context as unknown as RuntimeEnv;
  const binding = getBinding(env);
  const rawToken = decodeURIComponent(readCookie(context.request, ACCOUNT_COOKIE) ?? '');
  if (!binding || !rawToken) return null;
  const tokenHash = await sha256(`session:${rawToken}`);
  const session = normaliseSession(safeJsonParse(await binding.get(sessionKey(tokenHash))));
  if (!session) return null;
  const now = Date.now();
  if (new Date(session.expiresAt).getTime() <= now || new Date(session.lastSeenAt).getTime() + ACCOUNT_SESSION_IDLE_SECONDS * 1000 <= now) {
    await binding.delete(sessionKey(tokenHash));
    return null;
  }
  const account = await getAccountById(env, session.accountId);
  if (!account || account.status !== 'active') return null;
  return { account, session };
}

export async function invalidateCustomerSession(env: RuntimeEnv, request: Request) {
  const binding = getBinding(env);
  const rawToken = decodeURIComponent(readCookie(request, ACCOUNT_COOKIE) ?? '');
  if (!binding || !rawToken) return;
  await binding.delete(sessionKey(await sha256(`session:${rawToken}`)));
}

export async function invalidateCustomerSessions(env: RuntimeEnv, accountId: string) {
  const binding = getBinding(env);
  if (!binding) return;
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const result = await binding.list({ prefix: ACCOUNT_SESSION_KEY_PREFIX, cursor });
    cursor = result.list_complete ? undefined : result.cursor;
    keys.push(...result.keys.map((key) => key.name));
  } while (cursor);
  for (const key of keys) {
    const session = normaliseSession(safeJsonParse(await binding.get(key)));
    if (session?.accountId === accountId) await binding.delete(key);
  }
}

export async function resetCustomerPassword(env: RuntimeEnv, token: string, password: string) {
  const account = await consumeAccountToken(env, token, 'reset');
  if (!account || validateAccountPassword(password)) return null;
  const now = new Date().toISOString();
  const next = {
    ...account,
    passwordHash: await hashPassword(password),
    passwordUpdatedAt: now,
    updatedAt: now,
  };
  await saveAccount(env, next);
  await invalidateCustomerSessions(env, account.id);
  return next;
}

export async function linkHistoricalOrdersForAccount(env: RuntimeEnv, account: CustomerAccount) {
  if (!account.emailVerified || !isEmail(account.emailNormalized)) return 0;
  const orders = await listOrderRecords(env);
  let linked = 0;
  for (const order of orders) {
    if (order.paymentStatus !== 'PAID') continue;
    const orderEmail = normaliseEmail(order.customer.email);
    if (orderEmail !== account.emailNormalized) continue;
    if (order.customerAccountId && order.customerAccountId !== account.id) continue;
    if (order.customerAccountId === account.id) continue;
    await saveOrderRecord(env, {
      ...order,
      customerAccountId: account.id,
      updatedAt: new Date().toISOString(),
    });
    linked += 1;
  }
  return linked;
}

export async function listOrdersForAccount(env: RuntimeEnv, account: CustomerAccount, limit = 50) {
  if (!account.emailVerified) return [];
  const orders = await listOrderRecords(env);
  return orders
    .filter((order) => order.customerAccountId === account.id)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, limit);
}

export async function getOrderForAccount(env: RuntimeEnv, account: CustomerAccount, reference: string) {
  if (!account.emailVerified) return null;
  const order = await getOrderByReference(env, reference);
  if (!order || order.customerAccountId !== account.id) return null;
  return order;
}

export async function linkOrderToCurrentAccount(context: { request: Request } & RuntimeContext, order: OrderRecord) {
  const session = await getCustomerSession(context);
  if (!session?.account.emailVerified) return order;
  const nextOrder = {
    ...order,
    customerAccountId: session.account.id,
    updatedAt: new Date().toISOString(),
  };
  await saveOrderRecord((await import('./runtimeEnv')).getAdapterEnv(context), nextOrder);
  return nextOrder;
}
