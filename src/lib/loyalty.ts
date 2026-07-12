import type { OrderRecord } from './orderStore';
import type { RuntimeEnv } from './runtimeEnv';

const LOYALTY_LEDGER_PREFIX = 'bbm:loyalty:ledger:';
const LOYALTY_ACCOUNT_INDEX_PREFIX = 'bbm:loyalty:account:';
const LOYALTY_IDEMPOTENCY_PREFIX = 'bbm:loyalty:idempotency:';
const LOYALTY_RESERVATION_PREFIX = 'bbm:loyalty:reservation:';
const LOYALTY_RESERVATION_ACCOUNT_PREFIX = 'bbm:loyalty:reservation-account:';
const LOYALTY_RESERVATION_TTL_SECONDS = 60 * 30;
export const LOYALTY_POINTS_PER_POUND = 100;
export const LOYALTY_EARN_PERCENT = 5;

type KVListResult = {
  cursor?: string;
  list_complete?: boolean;
  keys: Array<{ name: string }>;
};

type KVNamespaceLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string }): Promise<KVListResult>;
};

export type LoyaltyEventType = 'earn' | 'redeem' | 'refund_reversal' | 'cancellation_reversal' | 'manual_adjustment';

export type LoyaltyLedgerEntry = {
  id: string;
  accountId: string;
  type: LoyaltyEventType;
  points: number;
  pence: number;
  orderReference?: string;
  orderNumber?: number;
  idempotencyKey: string;
  description: string;
  createdAt: string;
  reversesTransactionId?: string;
};

export type LoyaltyBalance = {
  points: number;
  pence: number;
  earnedPoints: number;
  earnedPence: number;
  redeemedPoints: number;
  redeemedPence: number;
};

export type LoyaltyReservation = {
  id: string;
  accountId: string;
  checkoutReference: string;
  pence: number;
  points: number;
  createdAt: string;
  expiresAt: string;
  finalisedAt?: string;
};

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

function getBinding(env: RuntimeEnv) {
  if (isKvNamespace(env.ORDERS)) return env.ORDERS;
  return isKvNamespace(env.SESSION) ? env.SESSION : null;
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function randomId(prefix: string) {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `${prefix}_${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function ledgerKey(id: string) {
  return `${LOYALTY_LEDGER_PREFIX}${id}`;
}

function accountIndexKey(accountId: string, entryId: string) {
  return `${LOYALTY_ACCOUNT_INDEX_PREFIX}${encodeURIComponent(accountId)}:${entryId}`;
}

function idempotencyKey(key: string) {
  return `${LOYALTY_IDEMPOTENCY_PREFIX}${encodeURIComponent(key)}`;
}

function reservationKey(id: string) {
  return `${LOYALTY_RESERVATION_PREFIX}${id}`;
}

function reservationAccountKey(accountId: string, id: string) {
  return `${LOYALTY_RESERVATION_ACCOUNT_PREFIX}${encodeURIComponent(accountId)}:${id}`;
}

function normaliseEntry(value: unknown): LoyaltyLedgerEntry | null {
  const entry = value && typeof value === 'object' ? value as Partial<LoyaltyLedgerEntry> : {};
  if (!entry.id || !entry.accountId || !entry.type || !entry.idempotencyKey || !entry.createdAt) return null;
  const points = Number(entry.points);
  const pence = Number(entry.pence);
  if (!Number.isFinite(points) || !Number.isFinite(pence)) return null;
  return {
    id: String(entry.id),
    accountId: String(entry.accountId),
    type: entry.type,
    points: Math.trunc(points),
    pence: Math.trunc(pence),
    orderReference: typeof entry.orderReference === 'string' ? entry.orderReference : undefined,
    orderNumber: typeof entry.orderNumber === 'number' ? entry.orderNumber : undefined,
    idempotencyKey: String(entry.idempotencyKey),
    description: typeof entry.description === 'string' ? entry.description : 'Loyalty activity',
    createdAt: String(entry.createdAt),
    reversesTransactionId: typeof entry.reversesTransactionId === 'string' ? entry.reversesTransactionId : undefined,
  };
}

function normaliseReservation(value: unknown): LoyaltyReservation | null {
  const reservation = value && typeof value === 'object' ? value as Partial<LoyaltyReservation> : {};
  if (!reservation.id || !reservation.accountId || !reservation.checkoutReference || !reservation.createdAt || !reservation.expiresAt) return null;
  const pence = Number(reservation.pence);
  const points = Number(reservation.points);
  if (!Number.isFinite(pence) || !Number.isFinite(points)) return null;
  return {
    id: String(reservation.id),
    accountId: String(reservation.accountId),
    checkoutReference: String(reservation.checkoutReference),
    pence: Math.max(0, Math.trunc(pence)),
    points: Math.max(0, Math.trunc(points)),
    createdAt: String(reservation.createdAt),
    expiresAt: String(reservation.expiresAt),
    finalisedAt: typeof reservation.finalisedAt === 'string' ? reservation.finalisedAt : undefined,
  };
}

export function calculateLoyaltyEarnPence(eligiblePence: number) {
  return Math.max(0, Math.floor(Math.max(0, Math.trunc(eligiblePence)) * LOYALTY_EARN_PERCENT / 100));
}

export function calculateEligibleOrderPence(order: OrderRecord) {
  return Math.max(0, order.totalPence || 0);
}

export function formatLoyaltyPoints(pence: number) {
  return Math.max(0, Math.trunc(pence));
}

export async function listLoyaltyLedger(env: RuntimeEnv, accountId: string, limit = 100) {
  const binding = getBinding(env);
  if (!binding || !accountId) return [];

  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const result = await binding.list({ prefix: `${LOYALTY_ACCOUNT_INDEX_PREFIX}${encodeURIComponent(accountId)}:`, cursor });
    cursor = result.list_complete ? undefined : result.cursor;
    keys.push(...result.keys.map((key) => key.name));
  } while (cursor);

  const entryIds = keys.map((key) => key.split(':').pop()).filter((value): value is string => Boolean(value));
  const entries = await Promise.all(entryIds.map((id) => binding.get(ledgerKey(id)).then((value) => normaliseEntry(safeJsonParse(value)))));
  return entries
    .filter((entry): entry is LoyaltyLedgerEntry => Boolean(entry))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

export async function getLoyaltyBalance(env: RuntimeEnv, accountId: string): Promise<LoyaltyBalance> {
  const entries = await listLoyaltyLedger(env, accountId, 500);
  return entries.reduce<LoyaltyBalance>((balance, entry) => {
    balance.points += entry.points;
    balance.pence += entry.pence;
    if (entry.pence > 0) {
      balance.earnedPoints += entry.points;
      balance.earnedPence += entry.pence;
    } else if (entry.pence < 0) {
      balance.redeemedPoints += Math.abs(entry.points);
      balance.redeemedPence += Math.abs(entry.pence);
    }
    return balance;
  }, { points: 0, pence: 0, earnedPoints: 0, earnedPence: 0, redeemedPoints: 0, redeemedPence: 0 });
}

async function listActiveReservations(env: RuntimeEnv, accountId: string) {
  const binding = getBinding(env);
  if (!binding || !accountId) return [];

  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const result = await binding.list({ prefix: `${LOYALTY_RESERVATION_ACCOUNT_PREFIX}${encodeURIComponent(accountId)}:`, cursor });
    cursor = result.list_complete ? undefined : result.cursor;
    keys.push(...result.keys.map((key) => key.name));
  } while (cursor);

  const reservationIds = keys.map((key) => key.split(':').pop()).filter((value): value is string => Boolean(value));
  const reservations = await Promise.all(reservationIds.map((id) => binding.get(reservationKey(id)).then((value) => normaliseReservation(safeJsonParse(value)))));
  const now = Date.now();
  return reservations.filter((reservation): reservation is LoyaltyReservation => Boolean(
    reservation &&
      !reservation.finalisedAt &&
      new Date(reservation.expiresAt).getTime() > now
  ));
}

export async function getRedeemableLoyaltyPence(env: RuntimeEnv, accountId: string) {
  const balance = await getLoyaltyBalance(env, accountId);
  const reserved = (await listActiveReservations(env, accountId)).reduce((total, reservation) => total + reservation.pence, 0);
  return Math.max(0, balance.pence - reserved);
}

async function createLedgerEntry(env: RuntimeEnv, input: Omit<LoyaltyLedgerEntry, 'id' | 'createdAt'>) {
  const binding = getBinding(env);
  if (!binding) return null;

  const existingId = await binding.get(idempotencyKey(input.idempotencyKey));
  if (existingId) return normaliseEntry(safeJsonParse(await binding.get(ledgerKey(existingId))));

  const entry: LoyaltyLedgerEntry = {
    ...input,
    id: randomId('loy'),
    points: Math.trunc(input.points),
    pence: Math.trunc(input.pence),
    createdAt: new Date().toISOString(),
  };

  await binding.put(ledgerKey(entry.id), JSON.stringify(entry));
  await binding.put(accountIndexKey(entry.accountId, entry.id), entry.id);
  await binding.put(idempotencyKey(entry.idempotencyKey), entry.id);
  return entry;
}

export async function awardLoyaltyForPaidOrder(env: RuntimeEnv, order: OrderRecord) {
  if (order.paymentStatus !== 'PAID' || !order.customerAccountId) return null;
  const earnedPence = calculateLoyaltyEarnPence(calculateEligibleOrderPence(order));
  if (earnedPence <= 0) return null;
  return createLedgerEntry(env, {
    accountId: order.customerAccountId,
    type: 'earn',
    points: formatLoyaltyPoints(earnedPence),
    pence: earnedPence,
    orderReference: order.reference,
    orderNumber: order.orderNumber,
    idempotencyKey: `earn:${order.reference}`,
    description: `Earned from order #${order.orderNumber}`,
  });
}

export async function reverseLoyaltyForCancelledOrder(env: RuntimeEnv, order: OrderRecord) {
  if (!order.customerAccountId) return null;
  const entries = await listLoyaltyLedger(env, order.customerAccountId, 500);
  const earned = entries.find((entry) => entry.type === 'earn' && entry.orderReference === order.reference);
  if (!earned) return null;
  return createLedgerEntry(env, {
    accountId: order.customerAccountId,
    type: 'cancellation_reversal',
    points: -Math.abs(earned.points),
    pence: -Math.abs(earned.pence),
    orderReference: order.reference,
    orderNumber: order.orderNumber,
    idempotencyKey: `cancel-reversal:${order.reference}`,
    description: `Cancellation adjustment for order #${order.orderNumber}`,
    reversesTransactionId: earned.id,
  });
}

export async function createLoyaltyReservation(env: RuntimeEnv, accountId: string, checkoutReference: string, requestedPence: number, eligiblePence: number) {
  const binding = getBinding(env);
  if (!binding || !accountId || requestedPence <= 0 || eligiblePence <= 0) return null;
  const redeemablePence = await getRedeemableLoyaltyPence(env, accountId);
  const pence = Math.min(Math.max(0, Math.trunc(requestedPence)), redeemablePence, Math.max(0, Math.trunc(eligiblePence)));
  if (pence <= 0) return null;

  const now = new Date();
  const reservation: LoyaltyReservation = {
    id: randomId('lres'),
    accountId,
    checkoutReference,
    pence,
    points: formatLoyaltyPoints(pence),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + LOYALTY_RESERVATION_TTL_SECONDS * 1000).toISOString(),
  };

  await binding.put(reservationKey(reservation.id), JSON.stringify(reservation), { expirationTtl: LOYALTY_RESERVATION_TTL_SECONDS + 300 });
  await binding.put(reservationAccountKey(accountId, reservation.id), reservation.id, { expirationTtl: LOYALTY_RESERVATION_TTL_SECONDS + 300 });
  return reservation;
}

export async function finaliseLoyaltyRedemption(env: RuntimeEnv, reservationId: string | undefined, order: OrderRecord) {
  const binding = getBinding(env);
  if (!binding || !reservationId || !order.customerAccountId) return null;
  const reservation = normaliseReservation(safeJsonParse(await binding.get(reservationKey(reservationId))));
  if (!reservation || reservation.accountId !== order.customerAccountId || reservation.finalisedAt || new Date(reservation.expiresAt).getTime() <= Date.now()) return null;

  const entry = await createLedgerEntry(env, {
    accountId: reservation.accountId,
    type: 'redeem',
    points: -reservation.points,
    pence: -reservation.pence,
    orderReference: order.reference,
    orderNumber: order.orderNumber,
    idempotencyKey: `redeem:${order.reference}`,
    description: `Redeemed on order #${order.orderNumber}`,
  });

  await binding.put(reservationKey(reservation.id), JSON.stringify({ ...reservation, finalisedAt: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 * 30 });
  return entry;
}
