import type { RuntimeEnv } from './runtimeEnv';

const POS_PIN_KEY = 'bbm:pos:pin';
const POS_PIN_ITERATIONS = 100_000;
const encoder = new TextEncoder();

type KVListResult = {
  cursor?: string;
  list_complete?: boolean;
  keys: Array<{ name: string }>;
};

type KVNamespaceLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string }): Promise<KVListResult>;
};

export type PosPinConfig = {
  scheme: 'pbkdf2_sha256';
  iterations: number;
  salt: string;
  hash: string;
  updatedAt: string;
};

export class PosAccessConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PosAccessConfigError';
  }
}

function isKvNamespace(value: unknown): value is KVNamespaceLike {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as KVNamespaceLike).get === 'function' &&
      typeof (value as KVNamespaceLike).put === 'function' &&
      typeof (value as KVNamespaceLike).list === 'function'
  );
}

function getPosConfigBinding(env: RuntimeEnv) {
  if (isKvNamespace(env.ORDERS)) {
    return env.ORDERS;
  }

  return isKvNamespace(env.SESSION) ? env.SESSION : null;
}

function isProductionRuntime(env: RuntimeEnv) {
  return env.MODE === 'production' || env.DEV === false;
}

function requirePosConfigBinding(env: RuntimeEnv) {
  const binding = getPosConfigBinding(env);

  if (!binding && isProductionRuntime(env)) {
    throw new PosAccessConfigError('Persistent POS access storage is not configured.');
  }

  return binding;
}

function base64UrlEncode(input: ArrayBuffer | Uint8Array) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function base64UrlDecodeBytes(input: string) {
  const padded = input.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((input.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function timingSafeEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}

function isValidPin(pin: string) {
  return /^\d{6}$/.test(pin);
}

async function derivePinHash(pin: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;

  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: saltBuffer,
      iterations,
    },
    key,
    256
  );
}

function safeJsonParse<T>(value: string | null) {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function normalizeConfig(value: PosPinConfig | null) {
  if (
    !value ||
    value.scheme !== 'pbkdf2_sha256' ||
    !Number.isInteger(value.iterations) ||
    value.iterations < 100_000 ||
    !value.salt ||
    !value.hash
  ) {
    return null;
  }

  return value;
}

export async function getPosPinConfig(env: RuntimeEnv) {
  const kv = requirePosConfigBinding(env);

  if (!kv) {
    return null;
  }

  return normalizeConfig(safeJsonParse<PosPinConfig>(await kv.get(POS_PIN_KEY)));
}

export async function getPosPinStatus(env: RuntimeEnv) {
  const config = await getPosPinConfig(env);

  return {
    configured: Boolean(config),
    updatedAt: config?.updatedAt,
  };
}

export async function setPosPin(env: RuntimeEnv, pin: string) {
  if (!isValidPin(pin)) {
    throw new Error('POS PIN must be exactly 6 digits.');
  }

  const kv = requirePosConfigBinding(env);

  if (!kv) {
    throw new PosAccessConfigError('Persistent POS access storage is not configured.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePinHash(pin, salt, POS_PIN_ITERATIONS);
  const config: PosPinConfig = {
    scheme: 'pbkdf2_sha256',
    iterations: POS_PIN_ITERATIONS,
    salt: base64UrlEncode(salt),
    hash: base64UrlEncode(hash),
    updatedAt: new Date().toISOString(),
  };

  await kv.put(POS_PIN_KEY, JSON.stringify(config));
  return config;
}

export async function verifyPosPin(env: RuntimeEnv, pin: string) {
  if (!isValidPin(pin)) {
    return false;
  }

  const config = await getPosPinConfig(env);

  if (!config) {
    return false;
  }

  const salt = base64UrlDecodeBytes(config.salt);
  const hash = await derivePinHash(pin, salt, config.iterations);

  return timingSafeEqual(base64UrlEncode(hash), config.hash);
}
