const EXTERNAL_PROTOCOL = /^(https?:\/\/|mailto:|tel:)/i;

export function normaliseStorefrontPath(value: unknown) {
  const href = String(value ?? '').trim();
  if (!href || href === '#') return '';
  if (EXTERNAL_PROTOCOL.test(href)) return href;
  const withoutTenant = href.replace(/^\/store\/[^/]+/, '');
  return `/${withoutTenant.replace(/^\/+/, '')}`;
}

export function resolveStorefrontHref(storeSlug: string, value: unknown) {
  const path = normaliseStorefrontPath(value);
  if (!path) return '';
  if (EXTERNAL_PROTOCOL.test(path)) return path;
  return `/store/${encodeURIComponent(storeSlug)}${path === '/' ? '' : path}`;
}

export function resolvePageId(pathname: string, pages: Record<string, { id: string; handle: string }>) {
  const cleanPath = `/${pathname.replace(/^\/+|\/+$/g, '')}`;
  if (cleanPath === '/') return 'home';
  const match = Object.values(pages).find((page) => normaliseStorefrontPath(page.handle) === cleanPath);
  if (match) return match.id;
  if (cleanPath.startsWith('/products/')) return pages.product ? 'product' : 'not_found';
  if (cleanPath.startsWith('/collections/')) return pages.collection ? 'collection' : 'not_found';
  if (cleanPath === '/cart') return pages.cart ? 'cart' : 'not_found';
  if (cleanPath === '/contact') return pages.contact ? 'contact' : 'not_found';
  return pages.not_found ? 'not_found' : 'home';
}
