interface Entry {
  count: number;
  resetAt: number;
}

const bucket = new Map<string, Entry>();

export function checkRateLimit(key: string, limit = 8, windowMs = 60_000): boolean {
  const now = Date.now();
  const current = bucket.get(key);

  if (!current || current.resetAt < now) {
    bucket.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (current.count >= limit) {
    return false;
  }

  current.count += 1;
  return true;
}

export function isRateLimited(key: string, limit = 8): boolean {
  const now = Date.now();
  const current = bucket.get(key);

  if (!current || current.resetAt < now) {
    bucket.delete(key);
    return false;
  }

  return current.count >= limit;
}

export function recordRateLimitAttempt(key: string, windowMs = 60_000): void {
  const now = Date.now();
  const current = bucket.get(key);

  if (!current || current.resetAt < now) {
    bucket.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  current.count += 1;
}

export function requestKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'local';
  return `${ip}:${new URL(request.url).pathname}`;
}
