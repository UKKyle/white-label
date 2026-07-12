import type { APIRoute } from 'astro';
import { buildClearCustomerSessionCookie, invalidateCustomerSession } from '../../lib/customerAccountAuth';
import { getAdapterEnv } from '../../lib/runtimeEnv';
import { routes } from '../../lib/routes';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getAdapterEnv({ locals });
  await invalidateCustomerSession(env, request);
  return new Response(null, {
    status: 303,
    headers: {
      Location: routes.accountSignIn,
      'Set-Cookie': buildClearCustomerSessionCookie(env),
    },
  });
};

