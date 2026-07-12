/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly PUBLIC_BUSINESS_NAME?: string;
  readonly WEB3FORMS_ACCESS_KEY?: string;
  readonly SUMUP_API_KEY?: string;
  readonly SUMUP_MERCHANT_CODE?: string;
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_SUPPORT_EMAIL?: string;
  readonly PUBLIC_ORDER_EMAIL?: string;
  readonly PUBLIC_PHONE?: string;
  readonly RESEND_API_KEY?: string;
  readonly ORDER_EMAIL_FROM?: string;
  readonly ORDER_EMAIL_REPLY_TO?: string;
  readonly POS_INGEST_SECRET?: string;
  readonly POS_ALLOWED_ORIGIN?: string;
  readonly ADMIN_EMAIL_ALLOWLIST?: string;
  readonly ADMIN_ALLOWED_EMAILS?: string;
  readonly ADMIN_EMAIL?: string;
  readonly ADMIN_USERNAME?: string;
  readonly ADMIN_USER?: string;
  readonly ADMIN_ACCESS_CODE?: string;
  readonly ADMIN_PASSWORD?: string;
  readonly ADMIN_PASSWORD_HASH?: string;
  readonly ADMIN_SECRET?: string;
  readonly ADMIN_LOGIN_SECRET?: string;
  readonly ADMIN_SESSION_SECRET?: string;
  readonly SESSION_SECRET?: string;
  readonly AUTH_SECRET?: string;
  readonly WHITE_LABEL_PROJECT_CONFIRMED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}

declare namespace App {
  interface Locals {
    cspNonce: string;
    csrfToken: string;
    requestId: string;
    cloudflare?: {
      env?: Record<string, unknown>;
    };
    env?: Record<string, unknown>;
  }
}
