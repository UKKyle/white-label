import type { APIRoute } from 'astro';
import { validateSignupDiscount } from '../../../lib/customerStore';
import { getAdapterEnv } from '../../../lib/runtimeEnv';
import { checkRateLimit, requestKey } from '../../../security/rate-limit';
import { sanitizeText } from '../../../security/sanitize';

export const prerender = false;

function normalisePence(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount);
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!checkRateLimit(requestKey(request), 20, 60_000)) {
    return Response.json({ message: 'Too many discount attempts. Please try again shortly.' }, { status: 429 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: 'Invalid discount request.' }, { status: 400 });
  }

  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const result = await validateSignupDiscount(getAdapterEnv({ locals }), {
    email: sanitizeText(String(record.email ?? '')).trim().toLowerCase().slice(0, 320),
    discountCode: sanitizeText(String(record.discountCode ?? '')).trim().toUpperCase().slice(0, 40),
    subtotalPence: normalisePence(record.subtotalPence),
  });

  if (!result.ok) {
    return Response.json({ message: result.message }, { status: 400 });
  }

  return Response.json({
    success: true,
    message: '10% signup discount applied.',
    discountCode: result.discountCode,
    discountPercent: result.discountPercent,
    discountMinimumSubtotalPence: result.discountMinimumSubtotalPence,
    discountAmountPence: result.discountAmountPence,
    discountedTotalPence: result.discountedTotalPence,
  });
};
