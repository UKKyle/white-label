import type { RuntimeEnv } from './runtimeEnv';
import { listOrderRecords, type OrderRecord } from './orderStore';

const CUSTOMER_KEY_PREFIX = 'bbm:customers:record:';
const CUSTOMER_INDEX_KEY = 'bbm:customers:index';
const MEMORY_STORE_KEY = '__BBM_CUSTOMER_MEMORY_STORE__';
export const SIGNUP_DISCOUNT_PERCENT = 10;
export const SIGNUP_DISCOUNT_MINIMUM_SUBTOTAL_PENCE = 2000;

type KVListResult = {
  cursor?: string;
  list_complete?: boolean;
  keys: Array<{ name: string }>;
};

type KVNamespaceLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string }): Promise<KVListResult>;
};

type MemoryStore = {
  customers: Map<string, CustomerRecord>;
};

export type CustomerRecord = {
  email: string;
  name?: string;
  phone?: string;
  marketingOptIn: boolean;
  source: string;
  createdAt: string;
  updatedAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
  signupCount: number;
  firstOrderAt?: string;
  latestOrderAt?: string;
  totalOrders: number;
  totalSpentPence: number;
  orderReferences: string[];
  discountCode?: string;
  discountPercent?: number;
  discountMinimumSubtotalPence?: number;
  discountStatus?: 'unused' | 'used';
  discountCreatedAt?: string;
  discountUsedAt?: string;
  discountUsedOrderReference?: string;
};

export type CustomerSignupInput = {
  email: string;
  marketingOptIn: boolean;
  name?: string;
  phone?: string;
  source?: string;
  preserveExistingMarketingOptIn?: boolean;
  countSignup?: boolean;
};

function isKvNamespace(value: unknown): value is KVNamespaceLike {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as KVNamespaceLike).get === 'function' &&
      typeof (value as KVNamespaceLike).put === 'function' &&
      typeof (value as KVNamespaceLike).list === 'function'
  );
}

function getCustomerStoreBinding(env: RuntimeEnv) {
  if (isKvNamespace(env.ORDERS)) return env.ORDERS;
  return isKvNamespace(env.SESSION) ? env.SESSION : null;
}

function getMemoryStore(): MemoryStore {
  const globalScope = globalThis as typeof globalThis & {
    [MEMORY_STORE_KEY]?: MemoryStore;
  };

  if (!globalScope[MEMORY_STORE_KEY]) {
    globalScope[MEMORY_STORE_KEY] = {
      customers: new Map<string, CustomerRecord>(),
    };
  }

  return globalScope[MEMORY_STORE_KEY] as MemoryStore;
}

function normaliseEmail(value: string) {
  return value.trim().toLowerCase();
}

function customerKey(email: string) {
  return `${CUSTOMER_KEY_PREFIX}${encodeURIComponent(email)}`;
}

function normaliseDiscountCode(value: string) {
  return value.trim().toUpperCase().replaceAll(/\s+/g, '');
}

function generateDiscountCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const suffix = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
  return `CRUMB10-${suffix}`;
}

async function readIndex(binding: KVNamespaceLike) {
  try {
    const stored = await binding.get(CUSTOMER_INDEX_KEY);
    const parsed = JSON.parse(stored || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

async function writeIndex(binding: KVNamespaceLike, emails: Set<string>) {
  await binding.put(CUSTOMER_INDEX_KEY, JSON.stringify([...emails].sort()));
}

function normaliseCustomerRecord(value: unknown): CustomerRecord | null {
  const record = value && typeof value === 'object' ? value as Partial<CustomerRecord> : {};
  const email = typeof record.email === 'string' ? normaliseEmail(record.email) : '';

  if (!email) return null;

  const createdAt = typeof record.createdAt === 'string' && record.createdAt ? record.createdAt : new Date().toISOString();
  const updatedAt = typeof record.updatedAt === 'string' && record.updatedAt ? record.updatedAt : createdAt;

  return {
    email,
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim().slice(0, 120) : undefined,
    phone: typeof record.phone === 'string' && record.phone.trim() ? record.phone.trim().slice(0, 40) : undefined,
    marketingOptIn: record.marketingOptIn === true,
    source: typeof record.source === 'string' && record.source ? record.source : 'signup_popup',
    createdAt,
    updatedAt,
    firstSeenAt: typeof record.firstSeenAt === 'string' && record.firstSeenAt ? record.firstSeenAt : createdAt,
    lastSeenAt: typeof record.lastSeenAt === 'string' && record.lastSeenAt ? record.lastSeenAt : updatedAt,
    signupCount: typeof record.signupCount === 'number' && Number.isFinite(record.signupCount)
      ? Math.max(1, record.signupCount)
      : 1,
    firstOrderAt: typeof record.firstOrderAt === 'string' && record.firstOrderAt ? record.firstOrderAt : undefined,
    latestOrderAt: typeof record.latestOrderAt === 'string' && record.latestOrderAt ? record.latestOrderAt : undefined,
    totalOrders: typeof record.totalOrders === 'number' && Number.isFinite(record.totalOrders) ? Math.max(0, Math.floor(record.totalOrders)) : 0,
    totalSpentPence: typeof record.totalSpentPence === 'number' && Number.isFinite(record.totalSpentPence) ? Math.max(0, Math.round(record.totalSpentPence)) : 0,
    orderReferences: Array.isArray(record.orderReferences)
      ? [...new Set(record.orderReferences.filter((reference): reference is string => typeof reference === 'string' && reference.trim().length > 0).map((reference) => reference.trim()))].slice(-250)
      : [],
    discountCode: typeof record.discountCode === 'string' && record.discountCode ? normaliseDiscountCode(record.discountCode) : undefined,
    discountPercent: record.discountPercent === SIGNUP_DISCOUNT_PERCENT ? SIGNUP_DISCOUNT_PERCENT : undefined,
    discountMinimumSubtotalPence: record.discountMinimumSubtotalPence === SIGNUP_DISCOUNT_MINIMUM_SUBTOTAL_PENCE ? SIGNUP_DISCOUNT_MINIMUM_SUBTOTAL_PENCE : undefined,
    discountStatus: record.discountStatus === 'used' ? 'used' : record.discountStatus === 'unused' ? 'unused' : undefined,
    discountCreatedAt: typeof record.discountCreatedAt === 'string' && record.discountCreatedAt ? record.discountCreatedAt : undefined,
    discountUsedAt: typeof record.discountUsedAt === 'string' && record.discountUsedAt ? record.discountUsedAt : undefined,
    discountUsedOrderReference: typeof record.discountUsedOrderReference === 'string' && record.discountUsedOrderReference ? record.discountUsedOrderReference : undefined,
  };
}

function ensureSignupDiscount(record: CustomerRecord, now: string): CustomerRecord {
  if (!record.marketingOptIn) return record;
  if (record.discountCode) return record;

  return {
    ...record,
    discountCode: generateDiscountCode(),
    discountPercent: SIGNUP_DISCOUNT_PERCENT,
    discountMinimumSubtotalPence: SIGNUP_DISCOUNT_MINIMUM_SUBTOTAL_PENCE,
    discountStatus: 'unused',
    discountCreatedAt: now,
  };
}

export async function upsertCustomerSignup(env: RuntimeEnv, input: CustomerSignupInput) {
  const email = normaliseEmail(input.email);
  const now = new Date().toISOString();
  const source = input.source?.trim() || 'signup_popup';
  const name = input.name?.trim().slice(0, 120);
  const phone = input.phone?.trim().slice(0, 40);
  const binding = getCustomerStoreBinding(env);
  const signupCountIncrement = input.countSignup === false ? 0 : 1;
  const nextMarketingOptIn = (existing: CustomerRecord | null) =>
    input.preserveExistingMarketingOptIn && existing?.marketingOptIn
      ? true
      : input.marketingOptIn;

  if (!binding) {
    const memoryStore = getMemoryStore();
    const existing = memoryStore.customers.get(email);
    const record: CustomerRecord = existing
      ? {
          ...existing,
          marketingOptIn: nextMarketingOptIn(existing),
          name: name || existing.name,
          phone: phone || existing.phone,
          source,
          updatedAt: now,
          lastSeenAt: now,
          signupCount: existing.signupCount + signupCountIncrement,
        }
      : {
          email,
          name: name || undefined,
          phone: phone || undefined,
          marketingOptIn: nextMarketingOptIn(null),
          source,
          createdAt: now,
          updatedAt: now,
          firstSeenAt: now,
          lastSeenAt: now,
          signupCount: 1,
          totalOrders: 0,
          totalSpentPence: 0,
          orderReferences: [],
        };
    const nextRecord = record.marketingOptIn ? ensureSignupDiscount(record, now) : record;
    memoryStore.customers.set(email, nextRecord);
    return nextRecord;
  }

  const existingRaw = await binding.get(customerKey(email));
  let existing: CustomerRecord | null = null;

  try {
    existing = existingRaw ? normaliseCustomerRecord(JSON.parse(existingRaw)) : null;
  } catch {
    existing = null;
  }
  const record: CustomerRecord = existing
    ? {
        ...existing,
        marketingOptIn: nextMarketingOptIn(existing),
        name: name || existing.name,
        phone: phone || existing.phone,
        source,
        updatedAt: now,
        lastSeenAt: now,
        signupCount: existing.signupCount + signupCountIncrement,
      }
    : {
        email,
        name: name || undefined,
        phone: phone || undefined,
        marketingOptIn: nextMarketingOptIn(null),
        source,
        createdAt: now,
        updatedAt: now,
        firstSeenAt: now,
        lastSeenAt: now,
        signupCount: 1,
        totalOrders: 0,
        totalSpentPence: 0,
        orderReferences: [],
      };

  const nextRecord = record.marketingOptIn ? ensureSignupDiscount(record, now) : record;

  await binding.put(customerKey(email), JSON.stringify(nextRecord));
  const emails = await readIndex(binding);
  emails.add(email);
  await writeIndex(binding, emails);

  return nextRecord;
}

export async function listCustomerRecords(env: RuntimeEnv) {
  const binding = getCustomerStoreBinding(env);

  if (!binding) {
    return [...getMemoryStore().customers.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  const emails = await readIndex(binding);
  const customers: CustomerRecord[] = [];

  for (const email of emails) {
    const stored = await binding.get(customerKey(email));
    if (!stored) continue;

    try {
      const record = normaliseCustomerRecord(JSON.parse(stored));
      if (record) customers.push(record);
    } catch {
      // Ignore malformed records rather than breaking the admin list.
    }
  }

  return customers.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getCustomerByEmail(env: RuntimeEnv, email: string) {
  const normalisedEmail = normaliseEmail(email);
  const binding = getCustomerStoreBinding(env);

  if (!binding) {
    return getMemoryStore().customers.get(normalisedEmail) ?? null;
  }

  const stored = await binding.get(customerKey(normalisedEmail));
  if (!stored) return null;

  try {
    return normaliseCustomerRecord(JSON.parse(stored));
  } catch {
    return null;
  }
}

/**
 * Rebuild a customer's order aggregates from the canonical paid-order records.
 * This makes payment-webhook retries idempotent: a reference is counted once,
 * rather than incrementing a counter for every delivery attempt.
 */
export async function syncCustomerFromCompletedOrder(env: RuntimeEnv, order: OrderRecord) {
  const email = normaliseEmail(order.customer.email);
  if (order.paymentStatus !== 'PAID' || !email) return null;

  const orders = await listOrderRecords(env);
  const paidOrders = [...new Map(
    orders
      .filter((item) => item.paymentStatus === 'PAID' && normaliseEmail(item.customer.email) === email)
      .map((item) => [item.reference, item])
  ).values()].sort((left, right) => (left.paidAt ?? left.createdAt).localeCompare(right.paidAt ?? right.createdAt));

  if (!paidOrders.length) return null;

  const existing = await getCustomerByEmail(env, email);
  const now = new Date().toISOString();
  const latestOrder = paidOrders[paidOrders.length - 1];
  const firstOrder = paidOrders[0];
  const latestConsentOrder = [...paidOrders].reverse().find((item) => typeof item.customer.marketingOptIn === 'boolean');
  const next: CustomerRecord = {
    email,
    name: latestOrder.customer.name || existing?.name,
    phone: latestOrder.customer.phone || existing?.phone,
    // An online checkout records the latest explicit preference. POS and historic
    // orders have no consent field, so they never infer or overwrite consent.
    marketingOptIn: typeof latestConsentOrder?.customer.marketingOptIn === 'boolean'
      ? latestConsentOrder.customer.marketingOptIn
      : (existing?.marketingOptIn ?? false),
    source: 'order',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    firstSeenAt: existing?.firstSeenAt ?? firstOrder.createdAt,
    lastSeenAt: now,
    signupCount: existing?.signupCount ?? 1,
    firstOrderAt: firstOrder.paidAt ?? firstOrder.createdAt,
    latestOrderAt: latestOrder.paidAt ?? latestOrder.createdAt,
    totalOrders: paidOrders.length,
    totalSpentPence: paidOrders.reduce((total, item) => total + item.totalPence, 0),
    orderReferences: paidOrders.map((item) => item.reference).slice(-250),
    discountCode: existing?.discountCode,
    discountPercent: existing?.discountPercent,
    discountMinimumSubtotalPence: existing?.discountMinimumSubtotalPence,
    discountStatus: existing?.discountStatus,
    discountCreatedAt: existing?.discountCreatedAt,
    discountUsedAt: existing?.discountUsedAt,
    discountUsedOrderReference: existing?.discountUsedOrderReference,
  };

  const binding = getCustomerStoreBinding(env);
  if (!binding) {
    getMemoryStore().customers.set(email, next);
    return next;
  }

  await binding.put(customerKey(email), JSON.stringify(next));
  const emails = await readIndex(binding);
  emails.add(email);
  await writeIndex(binding, emails);
  return next;
}

/** Safe to run repeatedly; paid orders are the sole source of order aggregates. */
export async function backfillCustomersFromPaidOrders(env: RuntimeEnv) {
  const orders = await listOrderRecords(env);
  const latestByEmail = new Map<string, OrderRecord>();
  for (const order of orders) {
    const email = normaliseEmail(order.customer.email);
    if (order.paymentStatus === 'PAID' && email) latestByEmail.set(email, order);
  }
  // Sequential writes avoid competing updates to the existing KV-backed index.
  for (const order of latestByEmail.values()) {
    await syncCustomerFromCompletedOrder(env, order);
  }
  return latestByEmail.size;
}

export type DiscountValidationResult =
  | {
      ok: true;
      customer: CustomerRecord;
      discountCode: string;
      discountPercent: number;
      discountMinimumSubtotalPence: number;
      discountAmountPence: number;
      discountedTotalPence: number;
    }
  | {
      ok: false;
      reason: 'missing' | 'invalid' | 'used' | 'email_mismatch' | 'below_minimum';
      message: string;
    };

export async function validateSignupDiscount(
  env: RuntimeEnv,
  input: { email: string; discountCode: string; subtotalPence: number }
): Promise<DiscountValidationResult> {
  const email = normaliseEmail(input.email);
  const discountCode = normaliseDiscountCode(input.discountCode);
  const subtotalPence = Math.max(0, Math.round(input.subtotalPence));

  if (!email || !discountCode) {
    return { ok: false, reason: 'missing', message: 'Enter your discount code and checkout email to apply it.' };
  }

  if (subtotalPence < SIGNUP_DISCOUNT_MINIMUM_SUBTOTAL_PENCE) {
    return { ok: false, reason: 'below_minimum', message: 'This code can only be used on orders over £20.' };
  }

  const customers = await listCustomerRecords(env);
  const matchedCustomer = customers.find((customer) => customer.discountCode === discountCode);

  if (!matchedCustomer || !matchedCustomer.discountCode) {
    return { ok: false, reason: 'invalid', message: 'That discount code is not valid.' };
  }

  if (!matchedCustomer.marketingOptIn) {
    return { ok: false, reason: 'invalid', message: 'That discount code is not valid.' };
  }

  if (matchedCustomer.email !== email) {
    return { ok: false, reason: 'email_mismatch', message: 'This discount code is linked to a different email address.' };
  }

  if (matchedCustomer.discountStatus === 'used') {
    return { ok: false, reason: 'used', message: 'This discount code has already been used.' };
  }

  const discountAmountPence = Math.min(subtotalPence, Math.round(subtotalPence * SIGNUP_DISCOUNT_PERCENT / 100));

  return {
    ok: true,
    customer: matchedCustomer,
    discountCode,
    discountPercent: SIGNUP_DISCOUNT_PERCENT,
    discountMinimumSubtotalPence: SIGNUP_DISCOUNT_MINIMUM_SUBTOTAL_PENCE,
    discountAmountPence,
    discountedTotalPence: Math.max(0, subtotalPence - discountAmountPence),
  };
}

export async function markSignupDiscountUsed(
  env: RuntimeEnv,
  input: { email: string; discountCode: string; orderReference: string }
) {
  const email = normaliseEmail(input.email);
  const discountCode = normaliseDiscountCode(input.discountCode);
  const now = new Date().toISOString();
  const customer = await getCustomerByEmail(env, email);

  if (!customer || customer.discountCode !== discountCode || customer.discountStatus === 'used') {
    return null;
  }

  const nextCustomer: CustomerRecord = {
    ...customer,
    discountStatus: 'used',
    discountUsedAt: now,
    discountUsedOrderReference: input.orderReference,
    updatedAt: now,
    lastSeenAt: now,
  };
  const binding = getCustomerStoreBinding(env);

  if (!binding) {
    getMemoryStore().customers.set(email, nextCustomer);
    return nextCustomer;
  }

  await binding.put(customerKey(email), JSON.stringify(nextCustomer));
  return nextCustomer;
}
