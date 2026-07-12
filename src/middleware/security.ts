import type { APIContext, MiddlewareNext } from 'astro';
import { createCsrfToken, getCsrfCookieName } from '../security/csrf';
import { securityHeaders } from '../security/headers';

export async function applySecurity(context: APIContext, next: MiddlewareNext) {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const existingCsrf = context.cookies.get(getCsrfCookieName())?.value;
  const csrfToken = existingCsrf ?? createCsrfToken();

  context.locals.cspNonce = nonce;
  context.locals.csrfToken = csrfToken;
  context.locals.requestId = crypto.randomUUID();

  if (!existingCsrf) {
    context.cookies.set(getCsrfCookieName(), csrfToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: context.url.protocol === 'https:',
      path: '/'
    });
  }

  // Cloudflare may guard route response headers, so clone before applying site-wide headers.
  const routeResponse = await next();
  const response = new Response(routeResponse.body, routeResponse);

  Object.entries(securityHeaders(nonce)).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  if (context.url.pathname.startsWith('/admin')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    response.headers.set('Cache-Control', 'no-store');
  }
  response.headers.set('X-Request-Id', context.locals.requestId);

  return response;
}
