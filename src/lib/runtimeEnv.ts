import { env as cloudflareEnv } from 'cloudflare:workers';
import { getSecret } from 'astro:env/server';

export type RuntimeContext = {
  request?: Request;
  locals?: unknown;
};

export type RuntimeEnv = {
  PUBLIC_BUSINESS_NAME?: string;
  WEB3FORMS_ACCESS_KEY?: string;
  SUMUP_API_KEY?: string;
  SUMUP_MERCHANT_CODE?: string;
  PUBLIC_SITE_URL?: string;
  PUBLIC_SUPPORT_EMAIL?: string;
  PUBLIC_ORDER_EMAIL?: string;
  PUBLIC_PHONE?: string;
  RESEND_API_KEY?: string;
  ORDER_EMAIL_FROM?: string;
  ORDER_EMAIL_REPLY_TO?: string;

  POS_INGEST_SECRET?: string;
  POS_ALLOWED_ORIGIN?: string;

  ADMIN_EMAIL_ALLOWLIST?: string;
  ADMIN_ALLOWED_EMAILS?: string;
  ADMIN_EMAIL?: string;
  ADMIN_USERNAME?: string;
  ADMIN_USER?: string;
  ADMIN_ACCESS_CODE?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_SECRET?: string;
  ADMIN_LOGIN_SECRET?: string;
  ADMIN_SESSION_SECRET?: string;
  ADMIN_TOTP_SECRET?: string;
  SESSION_SECRET?: string;
  AUTH_SECRET?: string;

  MODE?: string;
  DEV?: boolean;
  WHITE_LABEL_PROJECT_CONFIRMED?: string;

  SESSION?: unknown;
  ORDERS?: unknown;

  [key: string]: unknown;
};

function readObjectEnv(value: unknown) {
  return value && typeof value === 'object' ? (value as RuntimeEnv) : undefined;
}

function readLocalsEnv(locals: unknown) {
  if (!locals || typeof locals !== 'object') return undefined;

  const runtimeLocals = locals as {
    runtime?: { env?: RuntimeEnv };
    cloudflare?: { env?: RuntimeEnv };
    env?: RuntimeEnv;
  };

  try {
    if (readObjectEnv(runtimeLocals.cloudflare?.env)) {
      return runtimeLocals.cloudflare?.env;
    }
  } catch {
    // Older adapter shapes are optional; ignored when unavailable.
  }

  try {
    if (readObjectEnv(runtimeLocals.env)) {
      return runtimeLocals.env;
    }
  } catch {
    // Optional locals env shape.
  }

  return undefined;
}

function readProcessEnv() {
  const processLike = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };

  return processLike.process?.env;
}

function readSecretEnv() {
  const keys = [
    'WEB3FORMS_ACCESS_KEY',
    'PUBLIC_BUSINESS_NAME',
    'SUMUP_API_KEY',
    'SUMUP_MERCHANT_CODE',
    'PUBLIC_SITE_URL',
    'PUBLIC_SUPPORT_EMAIL',
    'PUBLIC_ORDER_EMAIL',
    'PUBLIC_PHONE',
    'RESEND_API_KEY',
    'ORDER_EMAIL_FROM',
    'ORDER_EMAIL_REPLY_TO',

    'POS_INGEST_SECRET',
    'POS_ALLOWED_ORIGIN',

    'ADMIN_EMAIL_ALLOWLIST',
    'ADMIN_ALLOWED_EMAILS',
    'ADMIN_EMAIL',
    'ADMIN_USERNAME',
    'ADMIN_USER',
    'ADMIN_ACCESS_CODE',
    'ADMIN_PASSWORD',
    'ADMIN_PASSWORD_HASH',
    'ADMIN_SECRET',
    'ADMIN_LOGIN_SECRET',
    'ADMIN_SESSION_SECRET',
    'ADMIN_TOTP_SECRET',
    'SESSION_SECRET',
    'AUTH_SECRET',
    'WHITE_LABEL_PROJECT_CONFIRMED',
  ] as const;

  const env: RuntimeEnv = {};

  for (const key of keys) {
    let value: string | undefined;

    try {
      value = getSecret(key);
    } catch {
      value = undefined;
    }

    if (typeof value === 'string') {
      env[key] = value;
    }
  }

  return env;
}

function readWorkerBindingEnv() {
  const env: RuntimeEnv = {};
  const bindingNames = ['SESSION', 'ORDERS'] as const;

  for (const name of bindingNames) {
    try {
      const value = cloudflareEnv[name];

      if (value) {
        env[name] = value;
      }
    } catch {
      // Optional Cloudflare bindings may be unavailable outside Workers.
    }
  }

  return env;
}

export function getAdapterEnv(context?: RuntimeContext): RuntimeEnv {
  return {
    ...(readObjectEnv(readProcessEnv()) ?? {}),
    ...(readObjectEnv(import.meta.env) ?? {}),
    ...readWorkerBindingEnv(),
    ...readSecretEnv(),
    ...(readObjectEnv(readLocalsEnv(context?.locals)) ?? {}),
  };
}
