export type CachedImageResponse = {
  bytes: Uint8Array;
  contentType: string;
  size: number;
};

const MAX_CACHED_IMAGE_RESPONSES = 24;

export function getImageResponseCache(cacheName: string) {
  const globalScope = globalThis as typeof globalThis & {
    [key: string]: Map<string, CachedImageResponse> | undefined;
  };

  if (!globalScope[cacheName]) {
    globalScope[cacheName] = new Map<string, CachedImageResponse>();
  }

  return globalScope[cacheName];
}

export function buildCachedImageResponse(cached: CachedImageResponse) {
  return new Response(cached.bytes.slice(), {
    status: 200,
    headers: {
      'Content-Type': cached.contentType,
      'Content-Length': String(cached.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function rememberImageResponse(cacheName: string, cacheKey: string, response: CachedImageResponse) {
  const cache = getImageResponseCache(cacheName);

  if (!cache.has(cacheKey) && cache.size >= MAX_CACHED_IMAGE_RESPONSES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  cache.set(cacheKey, response);
}
