import type { APIRoute } from 'astro';
import { syncCustomerFromCompletedOrder } from '../../../lib/customerStore';
import {
  createPosOrderRecord,
  getOrderByExternalSourceId,
  posStatusToPaymentStatus,
  saveOrderRecord,
  type CreatePosOrderRecordInput,
  type OrderAdminStatus,
  type OrderLineItem,
  type OrderPaymentMethod,
  type OrderPaymentStatus,
  type OrderPosMetadata,
  type OrderTimelineEntry,
} from '../../../lib/orderStore';
import { getAdapterEnv } from '../../../lib/runtimeEnv';
import { isEmail, sanitizeEmail, sanitizeText } from '../../../security/sanitize';

export const prerender = false;

type PosPayload = {
  externalOrderId?: unknown;
  source?: unknown;
  customer?: {
    name?: unknown;
    email?: unknown;
    phone?: unknown;
  };
  items?: Array<{
    id?: unknown;
    name?: unknown;
    quantity?: unknown;
    unitPrice?: unknown;
    totalPrice?: unknown;
  }>;
  subtotal?: unknown;
  total?: unknown;
  currency?: unknown;
  payment?: {
    status?: unknown;
    method?: unknown;
    reference?: unknown;
  };
  pos?: {
    deviceId?: unknown;
    userId?: unknown;
    userName?: unknown;
    location?: unknown;
  };
  notes?: unknown;
  createdAt?: unknown;
};

function json(data: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function normaliseOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function getAllowedOrigin(request: Request, configuredOrigin: unknown) {
  const requestOrigin = request.headers.get('origin') ?? '';
  const allowedOrigin = typeof configuredOrigin === 'string' ? configuredOrigin.trim() : '';

  if (!requestOrigin || !allowedOrigin) {
    return null;
  }

  const normalisedRequestOrigin = normaliseOrigin(requestOrigin);
  const normalisedAllowedOrigin = normaliseOrigin(allowedOrigin);

  if (!normalisedRequestOrigin || !normalisedAllowedOrigin) {
    return null;
  }

  return normalisedRequestOrigin === normalisedAllowedOrigin ? normalisedAllowedOrigin : null;
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

function normalisePence(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100);
}

function normaliseQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return Math.floor(quantity);
}

function normaliseCreatedAt(value: unknown) {
  const raw = sanitizeText(value).slice(0, 64);
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}

function normalisePaymentStatus(value: unknown): OrderPaymentStatus {
  return posStatusToPaymentStatus(sanitizeText(value).toUpperCase());
}

function normalisePaymentMethod(value: unknown): OrderPaymentMethod {
  const method = sanitizeText(value).toUpperCase();
  if (method === 'CARD') return 'CARD';
  if (method === 'CASH') return 'CASH';
  if (method === 'OTHER') return 'OTHER';
  return 'UNKNOWN';
}

function normaliseOrderStatus(paymentStatus: OrderPaymentStatus): OrderAdminStatus {
  if (paymentStatus === 'PAID') return 'COMPLETED';
  if (paymentStatus === 'PENDING') return 'NEW';
  if (paymentStatus === 'FAILED' || paymentStatus === 'CANCELLED' || paymentStatus === 'EXPIRED') return 'CANCELLED';
  return 'ON_HOLD';
}

function normalisePosMetadata(value: PosPayload['pos']): OrderPosMetadata | undefined {
  const pos = {
    deviceId: sanitizeText(value?.deviceId).slice(0, 120) || undefined,
    userId: sanitizeText(value?.userId).slice(0, 120) || undefined,
    userName: sanitizeText(value?.userName).slice(0, 120) || undefined,
    location: sanitizeText(value?.location).slice(0, 120) || undefined,
  };

  return Object.values(pos).some(Boolean) ? pos : undefined;
}

function normaliseItems(items: PosPayload['items']): OrderLineItem[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item, index) => {
      const name = sanitizeText(item?.name).slice(0, 160);
      const quantity = normaliseQuantity(item?.quantity);
      const unitPricePence = normalisePence(item?.unitPrice);
      const totalPricePence = normalisePence(item?.totalPrice);

      return {
        lineId: `pos-line-${index + 1}`,
        productId: sanitizeText(item?.id).slice(0, 120),
        externalItemId: sanitizeText(item?.id).slice(0, 120) || undefined,
        name,
        category: '',
        flavour: '',
        servingSize: '',
        quantity,
        unitPricePence,
        lineTotalPence: totalPricePence || unitPricePence * quantity,
        imageUrl: '',
      };
    })
    .filter((item) => item.name && item.quantity > 0 && item.unitPricePence >= 0 && item.lineTotalPence >= 0);
}

function buildTimeline(input: {
  createdAt: string;
  paymentStatus: OrderPaymentStatus;
  paymentMethod: OrderPaymentMethod;
  paymentReference?: string;
  pos?: OrderPosMetadata;
}): OrderTimelineEntry[] {
  const entries: OrderTimelineEntry[] = [
    {
      label: 'POS order created',
      at: input.createdAt,
      status: input.paymentStatus,
      meta: input.pos ? { ...input.pos } : undefined,
    },
  ];

  if (input.paymentStatus === 'PAID') {
    entries.push({
      label: 'POS payment marked paid',
      at: input.createdAt,
      status: input.paymentMethod,
      meta: input.paymentReference ? { reference: input.paymentReference } : undefined,
    });
  }

  entries.push({
    label: 'POS order synced to CMS',
    at: new Date().toISOString(),
    status: 'SYNCED',
  });

  return entries;
}

function validatePayload(payload: PosPayload) {
  const externalOrderId = sanitizeText(payload.externalOrderId).slice(0, 160);
  const items = normaliseItems(payload.items);
  const subtotalPence = normalisePence(payload.subtotal);
  const totalPence = normalisePence(payload.total);
  const currency = sanitizeText(payload.currency || 'GBP').slice(0, 10).toUpperCase() || 'GBP';
  const paymentStatus = normalisePaymentStatus(payload.payment?.status);
  const paymentMethod = normalisePaymentMethod(payload.payment?.method);
  const createdAt = normaliseCreatedAt(payload.createdAt);

  const itemsTotal = items.reduce((sum, item) => sum + item.lineTotalPence, 0);

  if (!externalOrderId || payload.source !== 'pos' || !items.length || totalPence < 0) {
    return null;
  }

  if (items.some((item) => !item.name || item.quantity <= 0 || item.unitPricePence < 0 || item.lineTotalPence < 0)) {
    return null;
  }

  if (totalPence !== itemsTotal) {
    return null;
  }

  const customerEmail = sanitizeEmail(payload.customer?.email);

  return {
    externalOrderId,
    items,
    subtotalPence,
    totalPence,
    currency,
    paymentStatus,
    paymentMethod,
    createdAt,
    customer: {
      name: sanitizeText(payload.customer?.name).slice(0, 120),
      email: customerEmail && isEmail(customerEmail) ? customerEmail : '',
      phone: sanitizeText(payload.customer?.phone).slice(0, 40),
    },
    paymentReference: sanitizeText(payload.payment?.reference).slice(0, 120),
    pos: normalisePosMetadata(payload.pos),
    notes: sanitizeText(payload.notes).slice(0, 500),
  };
}

export const OPTIONS: APIRoute = async ({ request, locals }) => {
  const env = getAdapterEnv({ locals });
  const allowedOrigin = getAllowedOrigin(request, env.POS_ALLOWED_ORIGIN);

  if (!allowedOrigin) {
    return new Response(null, { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: corsHeaders(allowedOrigin),
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getAdapterEnv({ locals });
  const allowedOrigin = getAllowedOrigin(request, env.POS_ALLOWED_ORIGIN);
  const secret = typeof env.POS_INGEST_SECRET === 'string' ? env.POS_INGEST_SECRET.trim() : '';

  if (!allowedOrigin) {
    return json({ ok: false, error: 'Origin not allowed' }, 403);
  }

  if (!secret) {
    return json({ ok: false, error: 'POS ingest is not configured' }, 500, corsHeaders(allowedOrigin));
  }

  const token = readBearerToken(request);

  if (!token || !timingSafeEqual(token, secret)) {
    return json({ ok: false, error: 'Unauthorised' }, 401, corsHeaders(allowedOrigin));
  }

  let payload: PosPayload;

  try {
    payload = await request.json() as PosPayload;
  } catch {
    return json({ ok: false, error: 'Invalid POS order payload' }, 400, corsHeaders(allowedOrigin));
  }

  const validated = validatePayload(payload);

  if (!validated) {
    return json({ ok: false, error: 'Invalid POS order payload' }, 400, corsHeaders(allowedOrigin));
  }

  const existingOrder = await getOrderByExternalSourceId(env, 'pos', validated.externalOrderId);

  if (existingOrder) {
    return json({
      ok: true,
      duplicate: true,
      orderId: existingOrder.reference,
      orderNumber: existingOrder.orderNumber,
    }, 200, corsHeaders(allowedOrigin));
  }

  const reference = `pos-${validated.externalOrderId.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80)}-${crypto.randomUUID().slice(0, 8)}`;
  const timeline = buildTimeline({
    createdAt: validated.createdAt,
    paymentStatus: validated.paymentStatus,
    paymentMethod: validated.paymentMethod,
    paymentReference: validated.paymentReference,
    pos: validated.pos,
  });

  const input: CreatePosOrderRecordInput = {
    reference,
    externalSourceId: validated.externalOrderId,
    currency: validated.currency,
    subtotalPence: validated.subtotalPence,
    totalPence: validated.totalPence,
    items: validated.items,
    customer: {
      name: validated.customer.name,
      email: validated.customer.email,
      phone: validated.customer.phone,
      fulfilmentMethod: 'pos',
      requestedDate: '',
      notes: validated.notes,
    },
    paymentStatus: validated.paymentStatus,
    paymentMethod: validated.paymentMethod,
    orderStatus: normaliseOrderStatus(validated.paymentStatus),
    customerMessage: validated.notes || undefined,
    pos: validated.pos,
    paidAt: validated.paymentStatus === 'PAID' ? validated.createdAt : undefined,
    createdAt: validated.createdAt,
    timeline,
  };

  const order = await createPosOrderRecord(env, input);
  await saveOrderRecord(env, order);
  if (order.paymentStatus === 'PAID') {
    await syncCustomerFromCompletedOrder(env, order);
  }

  return json({
    ok: true,
    duplicate: false,
    orderId: order.reference,
    orderNumber: order.orderNumber,
  }, 201, corsHeaders(allowedOrigin));
};
