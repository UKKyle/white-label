import type { APIRoute } from 'astro';
import { sendReceivedOrderEmail } from '../../../lib/orderEmails';
import { getCustomerSession } from '../../../lib/customerAccountAuth';
import { isPlainDateString, isUnavailableDate } from '../../../lib/availabilityStore';
import { markSignupDiscountUsed, validateSignupDiscount, type DiscountValidationResult } from '../../../lib/customerStore';
import { createLoyaltyReservation } from '../../../lib/loyalty';
import { assertPersistentOrderStore, createOrderRecord, OrderStoreConfigError, saveOrderRecord, type OrderCustomer } from '../../../lib/orderStore';
import { getOnlineStoreProduct } from '../../../lib/productStore';
import { getAdapterEnv } from '../../../lib/runtimeEnv';
import { createHostedSumUpCheckout, SumUpApiError, SumUpConfigError } from '../../../lib/sumup';
import { checkRateLimit, requestKey } from '../../../security/rate-limit';
import { isEmail, sanitizeText } from '../../../security/sanitize';

interface CheckoutLineItem {
  lineId: string;
  productId: string;
  name: string;
  category: string;
  flavour: string;
  servingSize: string;
  quantity: number;
  unitPricePence: number;
  lineTotalPence: number;
  imageUrl: string;
}

interface CheckoutPayload {
  currency: string;
  cartId: string;
  source: string;
  customer?: {
    name?: unknown;
    email?: unknown;
    phone?: unknown;
    fulfilmentMethod?: unknown;
    requestedDate?: unknown;
    deliveryAddress?: unknown;
    deliveryAddressLine1?: unknown;
    deliveryAddressLine2?: unknown;
    deliveryPostcode?: unknown;
    notes?: unknown;
    marketingOptIn?: unknown;
  };
  items: CheckoutLineItem[];
  discountCode?: unknown;
  loyaltyRedeemPence?: unknown;
  subtotalPence?: unknown;
  totalPence: number;
}

export const prerender = false;

function normalisePence(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount);
}

function normaliseQuantity(value: unknown): number {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity < 1) return 1;
  return Math.min(99, Math.floor(quantity));
}

function isCheckoutPayload(value: unknown): value is CheckoutPayload {
  if (!value || typeof value !== 'object') return false;

  const payload = value as Record<string, unknown>;
  return Array.isArray(payload.items);
}

function buildPublicSiteUrl(request: Request, configuredSiteUrl: unknown) {
  if (typeof configuredSiteUrl === 'string' && configuredSiteUrl.trim()) {
    return configuredSiteUrl.trim().replace(/\/+$/, '');
  }

  const url = new URL(request.url);
  return url.origin;
}

function buildCheckoutDescription(items: CheckoutLineItem[]) {
  const names = items.map((item) => `${item.name} x${item.quantity}`);
  const summary = names.slice(0, 3).join(', ');
  const suffix = names.length > 3 ? ` +${names.length - 3} more` : '';

  return `Crumb Works order: ${summary}${suffix}`.slice(0, 250);
}

function sanitiseEmail(value: unknown) {
  return sanitizeText(String(value ?? '')).trim().toLowerCase().slice(0, 160);
}

function normaliseAddressPart(value: unknown, maxLength = 160) {
  return sanitizeText(String(value ?? '')).trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function isValidPostcode(value: string) {
  const postcode = value.trim().replace(/\s+/g, ' ').toUpperCase();
  return postcode.length >= 5 && postcode.length <= 10 && /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(postcode);
}

function buildStructuredDeliveryAddress(customer: CheckoutPayload['customer']) {
  const line1 = normaliseAddressPart(customer?.deliveryAddressLine1);
  const line2 = normaliseAddressPart(customer?.deliveryAddressLine2);
  const postcode = normaliseAddressPart(customer?.deliveryPostcode, 20).toUpperCase();

  if (line1 || line2 || postcode) {
    return {
      line1,
      line2,
      postcode,
      address: [line1, line2, postcode].filter(Boolean).join(', '),
    };
  }

  const legacyParts = normaliseAddressPart(customer?.deliveryAddress, 500).split(',').map((part) => part.trim()).filter(Boolean);
  return {
    line1: legacyParts[0] || '',
    line2: legacyParts.length > 2 ? legacyParts.slice(1, -1).join(', ') : '',
    postcode: legacyParts.length > 1 ? legacyParts[legacyParts.length - 1].toUpperCase() : '',
    address: legacyParts.join(', '),
  };
}

function isValidDeliveryAddress(line1: string, postcode: string) {
  return line1.length >= 5 && isValidPostcode(postcode);
}

function normaliseCustomer(payload: CheckoutPayload['customer']): OrderCustomer | null {
  const name = sanitizeText(String(payload?.name ?? '')).trim().slice(0, 120);
  const email = sanitiseEmail(payload?.email);
  const phone = sanitizeText(String(payload?.phone ?? '')).trim().slice(0, 40);
  const fulfilmentMethod = String(payload?.fulfilmentMethod ?? '').trim().toLowerCase() === 'delivery'
    ? 'delivery'
    : 'collection';
  const requestedDate = sanitizeText(String(payload?.requestedDate ?? '')).trim().slice(0, 40);
  const delivery = buildStructuredDeliveryAddress(payload);
  const notes = sanitizeText(String(payload?.notes ?? '')).trim().slice(0, 500);
  const marketingOptIn = payload?.marketingOptIn === true;

  if (!name || !email || !phone || !requestedDate) {
    return null;
  }

  if (!isEmail(email)) {
    return null;
  }

  if (!isPlainDateString(requestedDate)) {
    return null;
  }

  if (fulfilmentMethod === 'delivery' && !isValidDeliveryAddress(delivery.line1, delivery.postcode)) {
    return null;
  }

  return {
    name,
    email,
    phone,
    marketingOptIn,
    fulfilmentMethod,
    requestedDate,
    deliveryAddress: fulfilmentMethod === 'delivery' ? delivery.address.slice(0, 500) : undefined,
    notes,
  };
}

function getSumUpErrorMessage(error: unknown) {
  if (error instanceof OrderStoreConfigError) {
    return 'Order storage is not configured correctly yet. Checkout is temporarily disabled until persistent admin order storage is available.';
  }

  if (error instanceof SumUpConfigError) {
    return 'Online checkout is not configured yet. Please continue with your enquiry for now.';
  }

  if (error instanceof SumUpApiError) {
    const responseBody = error.responseBody as { message?: unknown; error_code?: unknown } | string | null;
    const providerMessage = typeof responseBody === 'object' && responseBody
      ? [responseBody.message, responseBody.error_code].filter(Boolean).join(' ')
      : typeof responseBody === 'string'
        ? responseBody
        : '';

    return providerMessage || 'Online checkout could not be prepared right now. Please try again or continue with your enquiry.';
  }

  return 'We could not prepare checkout right now. Please try again or continue with your enquiry.';
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!checkRateLimit(requestKey(request), 8, 60_000)) {
    return Response.json({ message: 'Too many checkout attempts. Please try again shortly.' }, { status: 429 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: 'Invalid checkout payload.' }, { status: 400 });
  }

  if (!isCheckoutPayload(payload)) {
    return Response.json({ message: 'Invalid checkout payload.' }, { status: 400 });
  }

  const items = payload.items
    .map((item) => ({
      lineId: sanitizeText(item.lineId).slice(0, 120),
      productId: sanitizeText(item.productId).slice(0, 120),
      name: sanitizeText(item.name).slice(0, 160),
      category: sanitizeText(item.category).slice(0, 120),
      flavour: sanitizeText(item.flavour).slice(0, 120),
      servingSize: sanitizeText(item.servingSize).slice(0, 120),
      quantity: normaliseQuantity(item.quantity),
      unitPricePence: normalisePence(item.unitPricePence),
      lineTotalPence: normalisePence(item.lineTotalPence),
      imageUrl: sanitizeText(item.imageUrl).slice(0, 500)
    }))
    .filter((item) => item.name && item.quantity > 0 && item.unitPricePence > 0);

  if (!items.length) {
    return Response.json({ message: 'Your cart is empty.' }, { status: 400 });
  }

  const calculatedSubtotalPence = items.reduce((total, item) => total + item.unitPricePence * item.quantity, 0);
  const requestedTotalPence = normalisePence(payload.totalPence);
  const requestedSubtotalPence = normalisePence(payload.subtotalPence ?? payload.totalPence);
  const requestedDiscountCode = sanitizeText(String(payload.discountCode ?? '')).trim().toUpperCase().slice(0, 40);

  if (requestedSubtotalPence !== calculatedSubtotalPence) {
    return Response.json({ message: 'Cart total could not be verified. Please refresh your cart and try again.' }, { status: 400 });
  }

  const requestedDelivery = String(payload.customer?.fulfilmentMethod ?? '').trim().toLowerCase() === 'delivery';
  const requestedDeliveryAddress = buildStructuredDeliveryAddress(payload.customer);

  if (requestedDelivery && !isValidDeliveryAddress(requestedDeliveryAddress.line1, requestedDeliveryAddress.postcode)) {
    return Response.json({ message: 'Please enter address line 1 and a valid postcode before continuing to checkout.' }, { status: 400 });
  }

  const customer = normaliseCustomer(payload.customer);

  if (!customer) {
    return Response.json({ message: 'Please add your customer details before continuing to checkout.' }, { status: 400 });
  }

  const reference = sanitizeText(payload.cartId).slice(0, 120) || `bbm-${Date.now()}`;
  const env = getAdapterEnv({ locals });
  assertPersistentOrderStore(env);
  let discountResult: DiscountValidationResult | null = null;
  let loyaltyReservation = null;
  let loyaltyRedeemedPence = 0;
  let finalTotalPence = calculatedSubtotalPence;

  if (requestedDiscountCode) {
    discountResult = await validateSignupDiscount(env, {
      email: customer.email,
      discountCode: requestedDiscountCode,
      subtotalPence: calculatedSubtotalPence,
    });

    if (!discountResult.ok) {
      return Response.json({ message: discountResult.message }, { status: 400 });
    }

    finalTotalPence = discountResult.discountedTotalPence;
  }

  const accountSession = await getCustomerSession({ request, locals });
  const customerAccountId = accountSession?.account.emailVerified ? accountSession.account.id : undefined;
  const requestedLoyaltyRedeemPence = normalisePence(payload.loyaltyRedeemPence);

  if (requestedLoyaltyRedeemPence > 0) {
    if (!customerAccountId) {
      return Response.json({ message: 'Please sign in to use Loyalty Points.' }, { status: 401 });
    }

    loyaltyReservation = await createLoyaltyReservation(env, customerAccountId, reference, requestedLoyaltyRedeemPence, Math.max(0, finalTotalPence - 100));
    if (!loyaltyReservation || loyaltyReservation.pence <= 0) {
      return Response.json({ message: 'Those Loyalty Points could not be applied. Please refresh and try again.' }, { status: 400 });
    }

    loyaltyRedeemedPence = loyaltyReservation.pence;
    finalTotalPence = Math.max(0, finalTotalPence - loyaltyRedeemedPence);
  }

  if (requestedTotalPence !== finalTotalPence) {
    return Response.json({ message: 'Cart total could not be verified. Please refresh your cart and try again.' }, { status: 400 });
  }

  for (const item of items) {
    if (!item.productId) continue;

    const product = await getOnlineStoreProduct(env, item.productId);
    if (product?.enquireOnly) {
      return Response.json({ message: `${item.name} is currently enquiry only and cannot be checked out online.` }, { status: 400 });
    }
  }

  if (await isUnavailableDate(env, customer.requestedDate)) {
    return Response.json({ message: 'That requested date is currently unavailable. Please choose another date.' }, { status: 400 });
  }

  const publicSiteUrl = buildPublicSiteUrl(request, env.PUBLIC_SITE_URL);
  const redirectUrl = `${publicSiteUrl}/order-confirmation?reference=${encodeURIComponent(reference)}`;
  const returnUrl = `${publicSiteUrl}/api/checkout/webhook`;

  try {
    const checkout = await createHostedSumUpCheckout(env, {
      amount: finalTotalPence / 100,
      checkoutReference: reference,
      description: buildCheckoutDescription(items),
      redirectUrl,
      returnUrl,
    });

    const order = await createOrderRecord(env, {
      reference,
      source: sanitizeText(payload.source).slice(0, 40) || 'cart',
      currency: sanitizeText(payload.currency).slice(0, 10) || 'GBP',
      subtotalPence: calculatedSubtotalPence,
      discount: discountResult?.ok
        ? {
            code: discountResult.discountCode,
            percent: discountResult.discountPercent,
            minimumSubtotalPence: discountResult.discountMinimumSubtotalPence,
            amountPence: discountResult.discountAmountPence,
          }
        : undefined,
      loyalty: loyaltyRedeemedPence > 0
        ? {
            redeemedPence: loyaltyRedeemedPence,
            redeemedPoints: loyaltyRedeemedPence,
            reservationId: loyaltyReservation?.id,
          }
        : undefined,
      totalPence: finalTotalPence,
      items,
      customer,
      customerAccountId,
      checkoutId: checkout.id,
      checkoutReference: checkout.checkoutReference,
      hostedCheckoutUrl: checkout.hostedCheckoutUrl,
      sumupStatus: checkout.status,
    });

    await saveOrderRecord(env, order);
    if (discountResult?.ok) {
      await markSignupDiscountUsed(env, {
        email: customer.email,
        discountCode: discountResult.discountCode,
        orderReference: order.reference,
      });
    }
    await sendReceivedOrderEmail(env, order.reference);

    return Response.json({
      checkoutUrl: checkout.hostedCheckoutUrl,
      checkoutId: checkout.id,
      checkoutReference: checkout.checkoutReference,
      status: checkout.status,
      reference,
      orderNumber: order.orderNumber,
      checkoutReady: true
    });
  } catch (error) {
    console.error('sumup_checkout_create_failed', {
      message: error instanceof Error ? error.message : 'Unknown SumUp checkout error',
      status: error instanceof SumUpApiError ? error.status : undefined,
      responseBody: error instanceof SumUpApiError ? error.responseBody : undefined
    });

    return Response.json(
      {
        message: getSumUpErrorMessage(error),
        reference,
        checkoutReady: false
      },
      { status: error instanceof SumUpConfigError || error instanceof OrderStoreConfigError ? 501 : 502 }
    );
  }
};
