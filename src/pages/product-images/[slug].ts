import type { APIRoute } from 'astro';
import { buildCachedImageResponse, getImageResponseCache, rememberImageResponse } from '../../lib/imageResponseCache';
import { businessConfig } from '../../config/business';
import { getOnlineStoreProductImage, productImageBytes } from '../../lib/productStore';
import { getAdapterEnv } from '../../lib/runtimeEnv';

export const prerender = false;

const PRODUCT_IMAGE_RESPONSE_CACHE_KEY = '__CRUMB_WORKS_PRODUCT_IMAGE_RESPONSE_CACHE__';

export const GET: APIRoute = async (context) => {
  const slug = String(context.params.slug ?? '').trim();

  try {
    const version = context.url.searchParams.get('v')?.trim() ?? '';
    const cacheKey = version ? `${slug}:${version}` : '';
    const cached = cacheKey ? getImageResponseCache(PRODUCT_IMAGE_RESPONSE_CACHE_KEY).get(cacheKey) : null;

    if (cached) {
      return buildCachedImageResponse(cached);
    }

    const stored = await getOnlineStoreProductImage(getAdapterEnv(context), slug);

    if (!stored) {
      return context.redirect(businessConfig.branding.logoPath, 302);
    }

    const imageResponse = {
      bytes: productImageBytes(stored),
      contentType: stored.contentType,
      size: stored.size,
    };

    if (cacheKey && stored.updatedAt === version) {
      rememberImageResponse(PRODUCT_IMAGE_RESPONSE_CACHE_KEY, cacheKey, imageResponse);
    }

    return buildCachedImageResponse(imageResponse);
  } catch {
    return context.redirect(businessConfig.branding.logoPath, 302);
  }
};
