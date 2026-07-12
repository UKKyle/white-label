import type { APIRoute } from 'astro';
import { getPosPinStatus, verifyPosPin } from '../../../lib/posAccess';
import { getAdapterEnv } from '../../../lib/runtimeEnv';

export const prerender = false;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const [scheme, token] = authorization.split(/\s+/, 2);
  return scheme?.toLowerCase() === 'bearer' && token ? token.trim() : '';
}

function timingSafeEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}

function isAuthorized(request: Request, secret: unknown) {
  const configuredSecret = typeof secret === 'string' ? secret.trim() : '';
  const token = readBearerToken(request);

  return Boolean(configuredSecret && token && timingSafeEqual(token, configuredSecret));
}

export const GET: APIRoute = async ({ request, locals }) => {
  const env = getAdapterEnv({ locals });

  if (!isAuthorized(request, env.POS_INGEST_SECRET)) {
    return json({ ok: false, error: 'Unauthorised' }, 401);
  }

  const status = await getPosPinStatus(env);

  return json({ ok: true, ...status });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getAdapterEnv({ locals });

  if (!isAuthorized(request, env.POS_INGEST_SECRET)) {
    return json({ ok: false, error: 'Unauthorised' }, 401);
  }

  let payload: { pin?: unknown };

  try {
    payload = await request.json() as { pin?: unknown };
  } catch {
    return json({ ok: false, error: 'Invalid request' }, 400);
  }

  const ok = await verifyPosPin(env, String(payload.pin ?? ''));

  return json({ ok, configured: true }, ok ? 200 : 401);
};
