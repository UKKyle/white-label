const COOKIE_NAME = 'velora_csrf';

export function createCsrfToken(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

export function getCsrfCookieName(): string {
  return COOKIE_NAME;
}

export function isValidCsrf(request: Request, cookieToken?: string | null, bodyToken?: string | null): boolean {
  if (!cookieToken || !bodyToken) {
    return false;
  }

  const origin = request.headers.get('origin');
  const url = new URL(request.url);

  return origin === url.origin && cookieToken === bodyToken;
}
