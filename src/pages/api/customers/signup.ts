import type { APIRoute } from 'astro';
import { upsertCustomerSignup } from '../../../lib/customerStore';
import { getAdapterEnv } from '../../../lib/runtimeEnv';
import { checkRateLimit, requestKey } from '../../../security/rate-limit';
import { isEmail, sanitizeText } from '../../../security/sanitize';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!checkRateLimit(requestKey(request), 8, 60_000)) {
    return Response.json({ message: 'Too many signup attempts. Please try again shortly.' }, { status: 429 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: 'Invalid signup request.' }, { status: 400 });
  }

  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const email = sanitizeText(String(record.email ?? '')).trim().toLowerCase().slice(0, 320);
  const marketingOptIn = record.marketingOptIn === true;

  if (!isEmail(email)) {
    return Response.json({ message: 'Please enter a valid email address.' }, { status: 400 });
  }

  try {
    const customer = await upsertCustomerSignup(getAdapterEnv({ locals }), {
      email,
      marketingOptIn,
      source: 'signup_popup',
    });

    return Response.json({
      success: true,
      marketingOptIn,
      discountCode: marketingOptIn && customer.discountStatus === 'unused' ? customer.discountCode ?? null : null,
      discountStatus: customer.discountStatus ?? null,
    });
  } catch {
    return Response.json({ message: 'We could not save your signup right now. Please try again later.' }, { status: 500 });
  }
};
