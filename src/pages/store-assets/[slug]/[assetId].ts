import type { APIRoute } from 'astro';
import { getStoreBySlug } from '../../../lib/platform/store';
import { getStoreAsset } from '../../../lib/storefront/assetStore';

export const GET: APIRoute = async (context) => {
  const store = await getStoreBySlug(context.params.slug ?? '', context);
  const asset = store ? await getStoreAsset(store.id, context.params.assetId ?? '', context) : null;
  if (!store || !asset) return new Response('Not found', { status: 404 });
  const binary = atob(asset.base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Response(bytes, { headers: { 'Content-Type': asset.contentType, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
};

