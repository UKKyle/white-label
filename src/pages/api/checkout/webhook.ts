import type { APIRoute } from 'astro';
import { getOrderByCheckoutId } from '../../../lib/orderStore';
import { syncOrderWithSumUp } from '../../../lib/orderService';
import { getAdapterEnv } from '../../../lib/runtimeEnv';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }

  const event = payload && typeof payload === 'object' ? payload as {
    event_type?: unknown;
    id?: unknown;
  } : null;

  if (event?.event_type !== 'CHECKOUT_STATUS_CHANGED' || typeof event.id !== 'string' || !event.id.trim()) {
    return new Response(null, { status: 204 });
  }

  try {
    const env = getAdapterEnv({ locals });
    const order = await getOrderByCheckoutId(env, event.id.trim());

    if (order) {
      await syncOrderWithSumUp(env, order);
    }
  } catch (error) {
    console.error('sumup_webhook_sync_failed', {
      message: error instanceof Error ? error.message : 'Unknown SumUp webhook error',
    });
  }

  return new Response(null, { status: 204 });
};

const methodNotAllowed = () => new Response('Method not allowed', {
  status: 405,
  headers: {
    Allow: 'POST',
  },
});

export const GET: APIRoute = async () => methodNotAllowed();
