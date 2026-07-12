import { defineMiddleware } from 'astro:middleware';
import { applySecurity } from './middleware/security';
import { businessConfig } from './config/business';

const canonicalHost = new URL(businessConfig.siteUrl).hostname.toLowerCase();
const redirectHosts = new Set([businessConfig.domain, `www.${businessConfig.domain}`]
  .map((host) => host.toLowerCase())
  .filter((host) => host !== canonicalHost));

export const onRequest = defineMiddleware(async (context, next) => {
  const host = context.url.hostname.toLowerCase();

  if (redirectHosts.has(host)) {
    const target = new URL(context.url);
    target.protocol = 'https:';
    target.hostname = canonicalHost;
    return Response.redirect(target, 301);
  }

  return applySecurity(context, next);
});
