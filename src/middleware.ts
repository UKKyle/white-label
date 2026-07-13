import { defineMiddleware } from 'astro:middleware';
import { applySecurity } from './middleware/security';

const retiredPublicPaths = new Set(['/about','/cart','/contact','/faq','/loyalty','/privacy','/terms','/cookies-policy','/allergen-information','/order-confirmation','/products','/account']);

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = context.url.pathname.replace(/\/$/, '') || '/';
  if (retiredPublicPaths.has(pathname) || pathname.startsWith('/products/') || pathname.startsWith('/account/')) return context.redirect('/');
  if (pathname === '/admin/login') return context.redirect('/login');
  return applySecurity(context, next);
});
