import type { RuntimeEnv } from './runtimeEnv';

const ORDER_KEY_PREFIX = 'bbm:orders:record:';
const CHECKOUT_KEY_PREFIX = 'bbm:orders:checkout:';
const EXTERNAL_KEY_PREFIX = 'bbm:orders:external:';
const SNAPSHOT_KEY_PREFIX = 'bbm:orders:snapshot:';
const COUNTER_KEY = 'bbm:orders:counter';
const ORDER_INDEX_KEY = 'bbm:orders:index';
const MEMORY_STORE_KEY = '__BBM_ORDER_MEMORY_STORE__';

export type OrderSource = 'online' | 'pos' | 'manual' | string;
export type OrderPaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED' | 'UNKNOWN';
export type OrderFulfillmentStatus = 'UNFULFILLED' | 'ON_HOLD' | 'FULFILLED';
export type OrderPaymentMethod = 'SUMUP' | 'CARD' | 'CASH' | 'OTHER' | 'UNKNOWN';
export type OrderAdminStatus = 'NEW' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'ON_HOLD';

export type OrderLineItem = {
  lineId: string;
  productId: string;
  externalItemId?: string;
  name: string;
  category: string;
  flavour: string;
  servingSize: string;
  quantity: number;
  unitPricePence: number;
  lineTotalPence: number;
  imageUrl: string;
};

export type OrderCustomer = {
  name: string;
  email: string;
  phone: string;
  /** Explicit preference captured at online checkout; absent where consent was not collected. */
  marketingOptIn?: boolean;
  fulfilmentMethod: 'collection' | 'delivery' | 'pos';
  requestedDate: string;
  deliveryAddress?: string;
  notes: string;
};

export type OrderDiscount = {
  code: string;
  percent: number;
  minimumSubtotalPence: number;
  amountPence: number;
};

export type OrderLoyalty = {
  redeemedPence?: number;
  redeemedPoints?: number;
  reservationId?: string;
};

export type OrderTimelineEntry = {
  label: string;
  at: string;
  status?: string;
  meta?: Record<string, unknown>;
};

export type OrderPosMetadata = {
  deviceId?: string;
  userId?: string;
  userName?: string;
  location?: string;
};

export type OrderSumUpMetadata = {
  checkoutId: string;
  checkoutReference: string;
  hostedCheckoutUrl: string;
  status: string;
  lastSyncedAt: string;
  transactionId?: string;
  transactionCode?: string;
  transactionDate?: string;
};

export type OrderRecord = {
  id: string;
  reference: string;
  orderNumber: number;
  customerAccountId?: string;
  source: OrderSource;
  externalSourceId?: string;
  currency: string;
  subtotalPence?: number;
  discount?: OrderDiscount;
  loyalty?: OrderLoyalty;
  totalPence: number;
  items: OrderLineItem[];
  customer: OrderCustomer;
  paymentStatus: OrderPaymentStatus;
  paymentMethod: OrderPaymentMethod;
  fulfillmentStatus: OrderFulfillmentStatus;
  orderStatus: OrderAdminStatus;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  acceptedAt?: string;
  receivedEmailSentAt?: string;
  acceptedEmailSentAt?: string;
  receivedEmailFailedAt?: string;
  acceptedEmailFailedAt?: string;
  receivedEmailError?: string;
  acceptedEmailError?: string;
  statusLabel: string;
  customerMessage?: string;
  adminNotes?: string;
  timeline: OrderTimelineEntry[];
  pos?: OrderPosMetadata;
  sumup?: OrderSumUpMetadata;
};

export type CreateOrderRecordInput = {
  reference: string;
  source: string;
  currency: string;
  subtotalPence?: number;
  discount?: OrderDiscount;
  loyalty?: OrderLoyalty;
  totalPence: number;
  items: OrderLineItem[];
  customer: OrderCustomer;
  checkoutId: string;
  checkoutReference: string;
  hostedCheckoutUrl: string;
  sumupStatus: string;
  customerAccountId?: string;
};

export type CreatePosOrderRecordInput = {
  reference: string;
  externalSourceId: string;
  currency: string;
  subtotalPence: number;
  totalPence: number;
  items: OrderLineItem[];
  customer?: Partial<OrderCustomer>;
  paymentStatus: OrderPaymentStatus;
  paymentMethod: OrderPaymentMethod;
  orderStatus?: OrderAdminStatus;
  customerMessage?: string;
  adminNotes?: string;
  pos?: OrderPosMetadata;
  paidAt?: string;
  createdAt: string;
  timeline?: OrderTimelineEntry[];
};

type KVListResult = {
  cursor?: string;
  list_complete?: boolean;
  keys: Array<{ name: string }>;
};

type KVNamespaceLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string }): Promise<KVListResult>;
};

type MemoryStore = {
  counter: number;
  orders: Map<string, OrderRecord>;
  checkoutToReference: Map<string, string>;
  externalToReference: Map<string, string>;
};

export class OrderStoreConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderStoreConfigError';
  }
}

function isKvNamespace(value: unknown): value is KVNamespaceLike {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as KVNamespaceLike).get === 'function' &&
      typeof (value as KVNamespaceLike).put === 'function' &&
      typeof (value as KVNamespaceLike).delete === 'function' &&
      typeof (value as KVNamespaceLike).list === 'function'
  );
}

function getMemoryStore(): MemoryStore {
  const globalScope = globalThis as typeof globalThis & {
    [MEMORY_STORE_KEY]?: MemoryStore;
  };

  if (!globalScope[MEMORY_STORE_KEY]) {
    globalScope[MEMORY_STORE_KEY] = {
      counter: 2049,
      orders: new Map<string, OrderRecord>(),
      checkoutToReference: new Map<string, string>(),
      externalToReference: new Map<string, string>(),
    };
  }

  return globalScope[MEMORY_STORE_KEY] as MemoryStore;
}

function getOrderStoreBinding(env: RuntimeEnv) {
  if (isKvNamespace(env.ORDERS)) {
    return env.ORDERS;
  }

  return isKvNamespace(env.SESSION) ? env.SESSION : null;
}

function isProductionRuntime(env: RuntimeEnv) {
  return env.MODE === 'production' || env.DEV === false;
}

function requireOrderStoreBinding(env: RuntimeEnv) {
  const binding = getOrderStoreBinding(env);

  if (!binding && isProductionRuntime(env)) {
    throw new OrderStoreConfigError(
      'Persistent order storage is not configured. Add an ORDERS KV binding or keep the SESSION KV binding available before using checkout or admin orders.'
    );
  }

  return binding;
}

function orderKey(reference: string) {
  return `${ORDER_KEY_PREFIX}${reference}`;
}

function checkoutKey(checkoutId: string) {
  return `${CHECKOUT_KEY_PREFIX}${checkoutId}`;
}

function externalKey(source: string, externalSourceId: string) {
  return `${EXTERNAL_KEY_PREFIX}${source}:${externalSourceId}`;
}

function snapshotKey(reference: string, timestamp: string) {
  return `${SNAPSHOT_KEY_PREFIX}${reference}:${timestamp}`;
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function uniqueItemsCount(items: OrderLineItem[]) {
  return items.reduce((count, item) => count + item.quantity, 0);
}

function normaliseString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normaliseSource(value: unknown): OrderSource {
  const source = normaliseString(value).toLowerCase();

  if (!source || source === 'cart' || source === 'sumup') {
    return 'online';
  }

  if (source === 'pos') return 'pos';
  if (source === 'manual') return 'manual';
  return source;
}

function normaliseCurrency(value: unknown) {
  return normaliseString(value, 'GBP').toUpperCase() || 'GBP';
}

function normalisePence(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount);
}

function normaliseQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity < 1) return 1;
  return Math.max(1, Math.floor(quantity));
}

function normalisePaymentMethod(value: unknown, source: OrderSource): OrderPaymentMethod {
  const method = normaliseString(value).toUpperCase();

  if (method === 'SUMUP') return 'SUMUP';
  if (method === 'CARD') return 'CARD';
  if (method === 'CASH') return 'CASH';
  if (method === 'OTHER') return 'OTHER';
  if (source === 'online') return 'SUMUP';
  return 'UNKNOWN';
}

function normaliseOrderStatus(value: unknown, paymentStatus: OrderPaymentStatus, source: OrderSource): OrderAdminStatus {
  const status = normaliseString(value).toUpperCase();

  if (status === 'NEW') return 'NEW';
  if (status === 'ACCEPTED') return 'ACCEPTED';
  if (status === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'CANCELLED') return 'CANCELLED';
  if (status === 'ON_HOLD') return 'ON_HOLD';

  if (paymentStatus === 'PAID') {
    return source === 'pos' ? 'COMPLETED' : 'NEW';
  }

  if (paymentStatus === 'FAILED' || paymentStatus === 'EXPIRED' || paymentStatus === 'CANCELLED') {
    return 'CANCELLED';
  }

  if (paymentStatus === 'PENDING') {
    return 'ON_HOLD';
  }

  return 'NEW';
}

function normaliseFulfilmentMethod(value: unknown, source: OrderSource): OrderCustomer['fulfilmentMethod'] {
  const method = normaliseString(value).toLowerCase();

  if (method === 'delivery') return 'delivery';
  if (method === 'collection') return 'collection';
  return source === 'pos' ? 'pos' : 'collection';
}

function normaliseCustomer(value: unknown, source: OrderSource): OrderCustomer {
  const customer = value && typeof value === 'object' ? value as Partial<OrderCustomer> : {};

  return {
    name: normaliseString(customer.name),
    email: normaliseString(customer.email).toLowerCase(),
    phone: normaliseString(customer.phone),
    marketingOptIn: customer.marketingOptIn === true ? true : customer.marketingOptIn === false ? false : undefined,
    fulfilmentMethod: normaliseFulfilmentMethod(customer.fulfilmentMethod, source),
    requestedDate: normaliseString(customer.requestedDate),
    deliveryAddress: normaliseString(customer.deliveryAddress) || undefined,
    notes: normaliseString(customer.notes),
  };
}

function normaliseDiscount(value: unknown): OrderDiscount | undefined {
  const discount = value && typeof value === 'object' ? value as Partial<OrderDiscount> : {};
  const code = normaliseString(discount.code).toUpperCase();
  const percent = normalisePence(discount.percent);
  const minimumSubtotalPence = normalisePence(discount.minimumSubtotalPence);
  const amountPence = normalisePence(discount.amountPence);

  if (!code || percent <= 0 || amountPence <= 0) return undefined;

  return {
    code,
    percent,
    minimumSubtotalPence,
    amountPence,
  };
}

function normaliseLoyalty(value: unknown): OrderLoyalty | undefined {
  const loyalty = value && typeof value === 'object' ? value as Partial<OrderLoyalty> : {};
  const redeemedPence = normalisePence(loyalty.redeemedPence);
  const redeemedPoints = normalisePence(loyalty.redeemedPoints);
  const reservationId = normaliseString(loyalty.reservationId);

  if (redeemedPence <= 0 && redeemedPoints <= 0 && !reservationId) return undefined;

  return {
    redeemedPence: redeemedPence || undefined,
    redeemedPoints: redeemedPoints || undefined,
    reservationId: reservationId || undefined,
  };
}

function normaliseItems(value: unknown): OrderLineItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      const record = item && typeof item === 'object' ? item as Partial<OrderLineItem> : {};
      const quantity = normaliseQuantity(record.quantity);
      const unitPricePence = normalisePence(record.unitPricePence);
      const lineTotalPence = normalisePence(record.lineTotalPence) || unitPricePence * quantity;

      return {
        lineId: normaliseString(record.lineId) || `line-${index + 1}`,
        productId: normaliseString(record.productId),
        externalItemId: normaliseString(record.externalItemId) || undefined,
        name: normaliseString(record.name),
        category: normaliseString(record.category),
        flavour: normaliseString(record.flavour),
        servingSize: normaliseString(record.servingSize),
        quantity,
        unitPricePence,
        lineTotalPence,
        imageUrl: normaliseString(record.imageUrl),
      };
    })
    .filter((item) => item.name && item.quantity > 0);
}

function normaliseTimeline(value: unknown): OrderTimelineEntry[] {
  if (!Array.isArray(value)) return [];

  const timeline: OrderTimelineEntry[] = [];

  for (const entry of value) {
    const record = entry && typeof entry === 'object' ? entry as Partial<OrderTimelineEntry> : {};
    const label = normaliseString(record.label);
    const at = normaliseString(record.at);

    if (!label || !at) continue;

    timeline.push({
      label,
      at,
      status: normaliseString(record.status) || undefined,
      meta: record.meta && typeof record.meta === 'object' ? record.meta : undefined,
    });
  }

  return timeline;
}

function normalisePosMetadata(value: unknown): OrderPosMetadata | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const metadata = value as Partial<OrderPosMetadata>;
  const pos = {
    deviceId: normaliseString(metadata.deviceId) || undefined,
    userId: normaliseString(metadata.userId) || undefined,
    userName: normaliseString(metadata.userName) || undefined,
    location: normaliseString(metadata.location) || undefined,
  };

  return Object.values(pos).some(Boolean) ? pos : undefined;
}

function normaliseSumUpMetadata(value: unknown): OrderSumUpMetadata | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const metadata = value as Partial<OrderSumUpMetadata>;
  const checkoutId = normaliseString(metadata.checkoutId);

  if (!checkoutId) return undefined;

  return {
    checkoutId,
    checkoutReference: normaliseString(metadata.checkoutReference),
    hostedCheckoutUrl: normaliseString(metadata.hostedCheckoutUrl),
    status: normaliseString(metadata.status),
    lastSyncedAt: normaliseString(metadata.lastSyncedAt) || new Date().toISOString(),
    transactionId: normaliseString(metadata.transactionId) || undefined,
    transactionCode: normaliseString(metadata.transactionCode) || undefined,
    transactionDate: normaliseString(metadata.transactionDate) || undefined,
  };
}

export function sumupStatusToPaymentStatus(status: string): OrderPaymentStatus {
  const normalised = status.trim().toUpperCase();

  if (normalised === 'PAID') return 'PAID';
  if (normalised === 'FAILED') return 'FAILED';
  if (normalised === 'EXPIRED') return 'EXPIRED';
  if (normalised === 'CANCELLED') return 'CANCELLED';
  if (normalised === 'PENDING') return 'PENDING';
  return 'UNKNOWN';
}

export function posStatusToPaymentStatus(status: string): OrderPaymentStatus {
  const normalised = status.trim().toUpperCase();

  if (normalised === 'PAID') return 'PAID';
  if (normalised === 'PENDING') return 'PENDING';
  if (normalised === 'FAILED') return 'FAILED';
  if (normalised === 'CANCELLED') return 'CANCELLED';
  return 'UNKNOWN';
}

export function deriveFulfillmentStatus(paymentStatus: OrderPaymentStatus, source: OrderSource = 'online'): OrderFulfillmentStatus {
  if (source === 'pos' && paymentStatus === 'PAID') return 'FULFILLED';
  if (paymentStatus === 'PAID') return 'UNFULFILLED';
  if (paymentStatus === 'PENDING') return 'ON_HOLD';
  return 'ON_HOLD';
}

export function formatOrderStatusLabel(order: OrderRecord) {
  if (order.orderStatus === 'CANCELLED' || order.paymentStatus === 'CANCELLED') {
    return 'Cancelled';
  }

  if (order.orderStatus === 'ACCEPTED') {
    return 'Accepted';
  }

  if (order.paymentStatus === 'PAID' && order.fulfillmentStatus === 'FULFILLED') {
    return 'Fulfilled';
  }

  if (order.orderStatus === 'COMPLETED') {
    return 'Completed';
  }

  if (order.paymentStatus === 'PAID') {
    return 'Paid';
  }

  if (order.paymentStatus === 'FAILED') {
    return 'Payment failed';
  }

  if (order.paymentStatus === 'EXPIRED') {
    return 'Expired';
  }

  if (order.paymentStatus === 'UNKNOWN') {
    return 'Needs review';
  }

  return 'Payment pending';
}

function normalizeStoredOrder(value: unknown): OrderRecord | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Partial<OrderRecord>;
  const source = normaliseSource(record.source);
  const paymentStatus = sumupStatusToPaymentStatus(normaliseString(record.paymentStatus || record.sumup?.status || 'PENDING'));
  const items = normaliseItems(record.items);
  const customer = normaliseCustomer(record.customer, source);
  const createdAt = normaliseString(record.createdAt) || new Date().toISOString();
  const updatedAt = normaliseString(record.updatedAt) || createdAt;
  const sumup = normaliseSumUpMetadata(record.sumup);
  const paymentMethod = normalisePaymentMethod(record.paymentMethod, source);
  const fulfillmentStatus = (
    normaliseString(record.fulfillmentStatus).toUpperCase() === 'FULFILLED'
      ? 'FULFILLED'
      : normaliseString(record.fulfillmentStatus).toUpperCase() === 'ON_HOLD'
        ? 'ON_HOLD'
        : deriveFulfillmentStatus(paymentStatus, source)
  ) as OrderFulfillmentStatus;

  const order: OrderRecord = {
    id: normaliseString(record.id) || normaliseString(record.reference),
    reference: normaliseString(record.reference),
    orderNumber: Math.max(1, Number(record.orderNumber) || 0),
    customerAccountId: normaliseString(record.customerAccountId) || undefined,
    source,
    externalSourceId: normaliseString(record.externalSourceId) || undefined,
    currency: normaliseCurrency(record.currency),
    subtotalPence: record.subtotalPence == null ? undefined : normalisePence(record.subtotalPence),
    discount: normaliseDiscount(record.discount),
    loyalty: normaliseLoyalty(record.loyalty),
    totalPence: normalisePence(record.totalPence),
    items,
    customer,
    paymentStatus,
    paymentMethod,
    fulfillmentStatus,
    orderStatus: normaliseOrderStatus(record.orderStatus, paymentStatus, source),
    createdAt,
    updatedAt,
    paidAt: normaliseString(record.paidAt) || (paymentStatus === 'PAID' ? createdAt : undefined),
    acceptedAt: normaliseString(record.acceptedAt) || undefined,
    receivedEmailSentAt: normaliseString(record.receivedEmailSentAt) || undefined,
    acceptedEmailSentAt: normaliseString(record.acceptedEmailSentAt) || undefined,
    receivedEmailFailedAt: normaliseString(record.receivedEmailFailedAt) || undefined,
    acceptedEmailFailedAt: normaliseString(record.acceptedEmailFailedAt) || undefined,
    receivedEmailError: normaliseString(record.receivedEmailError) || undefined,
    acceptedEmailError: normaliseString(record.acceptedEmailError) || undefined,
    statusLabel: normaliseString(record.statusLabel),
    customerMessage: normaliseString(record.customerMessage) || undefined,
    adminNotes: normaliseString(record.adminNotes) || undefined,
    timeline: normaliseTimeline(record.timeline),
    pos: normalisePosMetadata(record.pos),
    sumup,
  };

  if (!order.reference) {
    return null;
  }

  order.id = order.id || order.reference;
  order.statusLabel = order.statusLabel || formatOrderStatusLabel(order);
  order.timeline = order.timeline.length ? order.timeline : [{
    label: source === 'pos' ? 'POS order created' : 'Order created',
    at: createdAt,
    status: order.orderStatus,
  }];

  if (!order.orderNumber) {
    order.orderNumber = 2050;
  }

  return order;
}

async function readOrderIndex(kv: KVNamespaceLike) {
  const parsed = safeJsonParse<string[]>(await kv.get(ORDER_INDEX_KEY));
  return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
}

async function writeOrderIndex(kv: KVNamespaceLike, references: string[]) {
  const uniqueReferences = [...new Set(references.filter(Boolean))];
  await kv.put(ORDER_INDEX_KEY, JSON.stringify(uniqueReferences));
}

export function assertPersistentOrderStore(env: RuntimeEnv) {
  requireOrderStoreBinding(env);
}

async function nextOrderNumber(env: RuntimeEnv) {
  const kv = requireOrderStoreBinding(env);

  if (!kv) {
    const memoryStore = getMemoryStore();
    memoryStore.counter += 1;
    return memoryStore.counter;
  }

  const currentCounter = Number((await kv.get(COUNTER_KEY)) ?? '2049');
  const nextCounter = Number.isFinite(currentCounter) ? currentCounter + 1 : 2050;
  await kv.put(COUNTER_KEY, String(nextCounter));
  return nextCounter;
}

export async function createOrderRecord(env: RuntimeEnv, input: CreateOrderRecordInput): Promise<OrderRecord> {
  const orderNumber = await nextOrderNumber(env);
  const now = new Date().toISOString();
  const paymentStatus = sumupStatusToPaymentStatus(input.sumupStatus);

  const order = normalizeStoredOrder({
    id: input.reference,
    reference: input.reference,
    orderNumber,
    customerAccountId: input.customerAccountId,
    source: input.source,
    currency: input.currency,
    subtotalPence: input.subtotalPence,
    discount: input.discount,
    loyalty: input.loyalty,
    totalPence: input.totalPence,
    items: input.items,
    customer: input.customer,
    paymentStatus,
    paymentMethod: 'SUMUP',
    fulfillmentStatus: deriveFulfillmentStatus(paymentStatus, 'online'),
    orderStatus: normaliseOrderStatus(undefined, paymentStatus, 'online'),
    createdAt: now,
    updatedAt: now,
    paidAt: paymentStatus === 'PAID' ? now : undefined,
    timeline: [
      {
        label: 'Checkout created',
        at: now,
        status: paymentStatus,
      },
    ],
    sumup: {
      checkoutId: input.checkoutId,
      checkoutReference: input.checkoutReference,
      hostedCheckoutUrl: input.hostedCheckoutUrl,
      status: input.sumupStatus,
      lastSyncedAt: now,
    },
  });

  if (!order) {
    throw new Error('Unable to create order record.');
  }

  return order;
}

export async function createPosOrderRecord(env: RuntimeEnv, input: CreatePosOrderRecordInput): Promise<OrderRecord> {
  const orderNumber = await nextOrderNumber(env);
  const createdAt = input.createdAt || new Date().toISOString();
  const paidAt = input.paidAt || (input.paymentStatus === 'PAID' ? createdAt : undefined);

  const order = normalizeStoredOrder({
    id: input.reference,
    reference: input.reference,
    orderNumber,
    source: 'pos',
    externalSourceId: input.externalSourceId,
    currency: input.currency,
    subtotalPence: input.subtotalPence,
    totalPence: input.totalPence,
    items: input.items,
    customer: {
      name: input.customer?.name ?? '',
      email: input.customer?.email ?? '',
      phone: input.customer?.phone ?? '',
      fulfilmentMethod: input.customer?.fulfilmentMethod ?? 'pos',
      requestedDate: input.customer?.requestedDate ?? '',
      notes: input.customer?.notes ?? '',
    },
    paymentStatus: input.paymentStatus,
    paymentMethod: input.paymentMethod,
    fulfillmentStatus: 'FULFILLED',
    orderStatus: input.orderStatus ?? normaliseOrderStatus(undefined, input.paymentStatus, 'pos'),
    createdAt,
    updatedAt: new Date().toISOString(),
    paidAt,
    customerMessage: input.customerMessage,
    adminNotes: input.adminNotes,
    pos: input.pos,
    timeline: input.timeline ?? [
      {
        label: 'POS order created',
        at: createdAt,
        status: input.paymentStatus,
      },
      ...(input.paymentStatus === 'PAID'
        ? [{
            label: 'POS payment marked paid',
            at: paidAt ?? createdAt,
            status: input.paymentMethod,
          }]
        : []),
      {
        label: 'POS order synced to CMS',
        at: new Date().toISOString(),
        status: 'SYNCED',
      },
    ],
  });

  if (!order) {
    throw new Error('Unable to create POS order record.');
  }

  return order;
}

export async function saveOrderRecord(env: RuntimeEnv, order: OrderRecord) {
  const kv = requireOrderStoreBinding(env);
  const normalizedOrder = normalizeStoredOrder(order);

  if (!normalizedOrder) {
    throw new Error('Unable to save invalid order record.');
  }

  if (!kv) {
    const memoryStore = getMemoryStore();
    memoryStore.orders.set(normalizedOrder.reference, normalizedOrder);

    if (normalizedOrder.sumup?.checkoutId) {
      memoryStore.checkoutToReference.set(normalizedOrder.sumup.checkoutId, normalizedOrder.reference);
    }

    if (normalizedOrder.externalSourceId) {
      memoryStore.externalToReference.set(
        `${normalizedOrder.source}:${normalizedOrder.externalSourceId}`,
        normalizedOrder.reference
      );
    }

    return;
  }

  const existingReferences = await readOrderIndex(kv);
  await kv.put(orderKey(normalizedOrder.reference), JSON.stringify(normalizedOrder));

  if (normalizedOrder.sumup?.checkoutId) {
    await kv.put(checkoutKey(normalizedOrder.sumup.checkoutId), normalizedOrder.reference);
  }

  if (normalizedOrder.externalSourceId) {
    await kv.put(externalKey(normalizedOrder.source, normalizedOrder.externalSourceId), normalizedOrder.reference);
  }

  await kv.put(snapshotKey(normalizedOrder.reference, normalizedOrder.updatedAt), JSON.stringify(normalizedOrder));
  await writeOrderIndex(kv, [...existingReferences, normalizedOrder.reference]);
}

export async function getOrderByReference(env: RuntimeEnv, reference: string) {
  const kv = requireOrderStoreBinding(env);

  if (!kv) {
    return getMemoryStore().orders.get(reference) ?? null;
  }

  return normalizeStoredOrder(safeJsonParse<OrderRecord>(await kv.get(orderKey(reference))));
}

export async function updateOrderRecord(
  env: RuntimeEnv,
  reference: string,
  update: (order: OrderRecord) => OrderRecord
) {
  const existingOrder = await getOrderByReference(env, reference);

  if (!existingOrder) {
    return null;
  }

  const nextOrder = normalizeStoredOrder(update(existingOrder));

  if (!nextOrder) {
    throw new Error('Unable to update invalid order record.');
  }

  await saveOrderRecord(env, nextOrder);
  return nextOrder;
}

export async function getOrderByCheckoutId(env: RuntimeEnv, checkoutId: string) {
  const kv = requireOrderStoreBinding(env);

  if (!kv) {
    const reference = getMemoryStore().checkoutToReference.get(checkoutId);
    return reference ? getMemoryStore().orders.get(reference) ?? null : null;
  }

  const reference = await kv.get(checkoutKey(checkoutId));
  return reference ? getOrderByReference(env, reference) : null;
}

export async function getOrderByExternalSourceId(env: RuntimeEnv, source: string, externalSourceId: string) {
  const normalisedSource = normaliseSource(source);
  const normalisedExternalId = normaliseString(externalSourceId);

  if (!normalisedExternalId) {
    return null;
  }

  const kv = requireOrderStoreBinding(env);

  if (!kv) {
    const reference = getMemoryStore().externalToReference.get(`${normalisedSource}:${normalisedExternalId}`);
    return reference ? getMemoryStore().orders.get(reference) ?? null : null;
  }

  const reference = await kv.get(externalKey(normalisedSource, normalisedExternalId));

  if (reference) {
    return getOrderByReference(env, reference);
  }

  const allOrders = await listOrderRecords(env);
  return allOrders.find((order) => order.source === normalisedSource && order.externalSourceId === normalisedExternalId) ?? null;
}

export async function listOrderRecords(env: RuntimeEnv) {
  const kv = requireOrderStoreBinding(env);

  if (!kv) {
    return [...getMemoryStore().orders.values()].sort((left, right) => (
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    ));
  }

  let references = await readOrderIndex(kv);

  if (!references.length) {
    const keys: string[] = [];
    let cursor: string | undefined;

    do {
      const result = await kv.list({ prefix: ORDER_KEY_PREFIX, cursor });
      cursor = result.list_complete ? undefined : result.cursor;
      keys.push(...result.keys.map((key) => key.name));
    } while (cursor);

    references = keys
      .map((key) => key.replace(ORDER_KEY_PREFIX, ''))
      .filter(Boolean);

    if (references.length) {
      await writeOrderIndex(kv, references);
    }
  }

  const records = await Promise.all(
    references.map(async (reference) => normalizeStoredOrder(safeJsonParse<OrderRecord>(await kv.get(orderKey(reference)))))
  );

  return records
    .filter((record): record is OrderRecord => Boolean(record))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

async function listKeysByPrefix(kv: KVNamespaceLike, prefix: string) {
  const keys: string[] = [];
  let cursor: string | undefined;

  do {
    const result = await kv.list({ prefix, cursor });
    cursor = result.list_complete ? undefined : result.cursor;
    keys.push(...result.keys.map((key) => key.name));
  } while (cursor);

  return keys;
}

export async function clearOrderRecords(env: RuntimeEnv) {
  const kv = requireOrderStoreBinding(env);

  if (!kv) {
    const memoryStore = getMemoryStore();
    const deletedOrders = memoryStore.orders.size;

    memoryStore.orders.clear();
    memoryStore.checkoutToReference.clear();
    memoryStore.externalToReference.clear();
    memoryStore.counter = 2049;

    return { deletedOrders, deletedKeys: deletedOrders };
  }

  const orderKeys = await listKeysByPrefix(kv, ORDER_KEY_PREFIX);
  const lookupKeys = [
    ...(await listKeysByPrefix(kv, CHECKOUT_KEY_PREFIX)),
    ...(await listKeysByPrefix(kv, EXTERNAL_KEY_PREFIX)),
    ...(await listKeysByPrefix(kv, SNAPSHOT_KEY_PREFIX)),
  ];
  const housekeepingKeys = [ORDER_INDEX_KEY, COUNTER_KEY];
  const keys = [...new Set([...orderKeys, ...lookupKeys, ...housekeepingKeys])];

  await Promise.all(keys.map((key) => kv.delete(key)));

  return {
    deletedOrders: orderKeys.length,
    deletedKeys: keys.length,
  };
}

export function orderItemCount(order: OrderRecord) {
  return uniqueItemsCount(order.items);
}
