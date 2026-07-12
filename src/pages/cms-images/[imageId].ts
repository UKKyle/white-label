import type { APIRoute } from 'astro';
import { base64ToBytes, getStoredManagedImage } from '../../lib/imageStore';
import { buildCachedImageResponse, getImageResponseCache, rememberImageResponse } from '../../lib/imageResponseCache';
import { getManagedImageDefinition } from '../../lib/managedImages';
import { getAdapterEnv } from '../../lib/runtimeEnv';

export const prerender = false;

const CMS_IMAGE_RESPONSE_CACHE_KEY = '__CRUMB_WORKS_CMS_IMAGE_RESPONSE_CACHE__';

export const GET: APIRoute = async (context) => {
  const imageId = String(context.params.imageId ?? '').trim();
  const definition = getManagedImageDefinition(imageId);

  if (!definition) {
    return new Response('Image not found', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }

  try {
    const version = context.url.searchParams.get('v')?.trim() ?? '';
    const cacheKey = version ? `${imageId}:${version}` : '';
    const cached = cacheKey ? getImageResponseCache(CMS_IMAGE_RESPONSE_CACHE_KEY).get(cacheKey) : null;

    if (cached) {
      return buildCachedImageResponse(cached);
    }

    const stored = await getStoredManagedImage(getAdapterEnv(context), imageId);

    if (!stored) {
      return context.redirect(definition.fallbackSrc, 302);
    }

    const imageResponse = {
      bytes: base64ToBytes(stored.base64),
      contentType: stored.contentType,
      size: stored.size,
    };

    if (cacheKey && stored.updatedAt === version) {
      rememberImageResponse(CMS_IMAGE_RESPONSE_CACHE_KEY, cacheKey, imageResponse);
    }

    return buildCachedImageResponse(imageResponse);
  } catch {
    return context.redirect(definition.fallbackSrc, 302);
  }
};
