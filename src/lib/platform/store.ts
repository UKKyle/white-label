import { getAdapterEnv, type RuntimeContext } from '../runtimeEnv';
import type { AuditLog, PlatformSession, PlatformUser, Store, StoreMembership, StoreSettings } from '../../types/platform';
import { hashPlatformPassword, validatePlatformPassword, verifyPlatformPassword } from './passwords';

type Kv = { get(key: string, type?: 'json'): Promise<unknown>; put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>; delete(key: string): Promise<void>; list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }> };
const memory = new Map<string, string>();
const PREFIX = 'wl:v1:';

function now() { return new Date().toISOString(); }
function id() { return crypto.randomUUID(); }
function key(...parts: string[]) { return PREFIX + parts.join(':'); }
function normaliseEmail(value: string) { return value.trim().toLowerCase(); }
export function normaliseSlug(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
const reservedSlugs = new Set(['admin', 'owner', 'login', 'api', 'www', 'support', 'assets', 'static']);

async function binding(context?: RuntimeContext): Promise<Kv | null> {
  const candidate = getAdapterEnv(context).SESSION as Kv | undefined;
  return candidate && typeof candidate.get === 'function' && typeof candidate.put === 'function' ? candidate : null;
}
async function read<T>(name: string, context?: RuntimeContext): Promise<T | null> {
  const kv = await binding(context); const value = kv ? await kv.get(name) : memory.get(name);
  if (!value) return null;
  try { return typeof value === 'string' ? JSON.parse(value) as T : value as T; } catch { return null; }
}
async function write<T>(name: string, value: T, context?: RuntimeContext, ttl?: number) {
  const body = JSON.stringify(value); const kv = await binding(context);
  if (kv) await kv.put(name, body, ttl ? { expirationTtl: ttl } : undefined); else memory.set(name, body);
}

export async function getUserById(userId: string, context?: RuntimeContext) { return read<PlatformUser>(key('user', userId), context); }
export async function getUserByEmail(email: string, context?: RuntimeContext) {
  const userId = await read<string>(key('user-email', normaliseEmail(email)), context);
  return userId ? getUserById(userId, context) : null;
}
export async function getStore(storeId: string, context?: RuntimeContext) { return read<Store>(key('store', storeId), context); }
export async function getStoreBySlug(slug: string, context?: RuntimeContext) {
  const storeId = await read<string>(key('store-slug', normaliseSlug(slug)), context); return storeId ? getStore(storeId, context) : null;
}
export async function getMembership(userId: string, storeId: string, context?: RuntimeContext) { return read<StoreMembership>(key('membership', userId, storeId), context); }
export async function listMemberships(userId: string, context?: RuntimeContext) {
  const index = await read<string[]>(key('user-memberships', userId), context) ?? [];
  return (await Promise.all(index.map((storeId) => getMembership(userId, storeId, context)))).filter((item): item is StoreMembership => Boolean(item));
}
export async function listStores(context?: RuntimeContext) {
  const ids = await read<string[]>(key('stores'), context) ?? [];
  return (await Promise.all(ids.map((storeId) => getStore(storeId, context)))).filter((item): item is Store => Boolean(item));
}
export async function getSettings(storeId: string, context?: RuntimeContext) { return read<StoreSettings>(key('settings', storeId), context); }

export async function appendAudit(input: Omit<AuditLog, 'id' | 'createdAt'>, context?: RuntimeContext) {
  const event: AuditLog = { ...input, id: id(), createdAt: now() };
  const index = await read<string[]>(key('audits'), context) ?? []; index.unshift(event.id);
  await Promise.all([write(key('audit', event.id), event, context), write(key('audits'), index.slice(0, 500), context)]);
  return event;
}

export async function registerMerchant(input: { firstName: string; lastName: string; businessName: string; email: string; phone: string; password: string; slug: string; category: string; address: string }, context?: RuntimeContext) {
  const email = normaliseEmail(input.email); const slug = normaliseSlug(input.slug);
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
  if (await getUserByEmail(email, context)) throw new Error('Unable to create this account.');
  if (!slug || slug.length < 3 || reservedSlugs.has(slug) || await getStoreBySlug(slug, context)) throw new Error('Choose a different store slug.');
  const passwordError = validatePlatformPassword(input.password); if (passwordError) throw new Error(passwordError);
  const createdAt = now(); const userId = id(); const storeId = id();
  const user: PlatformUser = { id: userId, email, passwordHash: await hashPlatformPassword(input.password), firstName: input.firstName.trim(), lastName: input.lastName.trim(), phone: input.phone.trim(), status: 'active', createdAt, updatedAt: createdAt };
  const store: Store = { id: storeId, name: input.businessName.trim(), slug, status: 'trial', billingStatus: 'trial', ownerUserId: userId, businessCategory: input.category.trim(), contactEmail: email, contactPhone: input.phone.trim(), plan: 'starter', createdAt, updatedAt: createdAt, lastActivityAt: createdAt };
  const membership: StoreMembership = { id: id(), storeId, userId, role: 'store_owner', status: 'active', createdAt, updatedAt: createdAt };
  const settings: StoreSettings = { storeId, currency: 'GBP', timezone: 'Europe/London', businessAddress: input.address.trim(), orderSettings: {}, taxSettings: {}, fulfilmentSettings: {}, brandingSettings: {}, domainSettings: {}, checkoutSettings: {}, notificationSettings: {} };
  const stores = await read<string[]>(key('stores'), context) ?? [];
  await Promise.all([write(key('user', userId), user, context), write(key('user-email', email), userId, context), write(key('store', storeId), store, context), write(key('store-slug', slug), storeId, context), write(key('membership', userId, storeId), membership, context), write(key('user-memberships', userId), [storeId], context), write(key('settings', storeId), settings, context), write(key('stores'), [...stores, storeId], context)]);
  await appendAudit({ actorUserId: userId, actorRole: 'store_owner', storeId, action: 'store.created', targetType: 'store', targetId: storeId, metadata: { slug } }, context);
  return { user, store, membership };
}

export async function authenticateMerchant(email: string, password: string, context?: RuntimeContext) {
  const user = await getUserByEmail(email, context); if (!user || user.status !== 'active' || !(await verifyPlatformPassword(password, user.passwordHash))) return null;
  const memberships = await listMemberships(user.id, context); const membership = memberships.find((item) => item.status === 'active'); if (!membership) return null;
  const store = await getStore(membership.storeId, context); if (!store || ['suspended', 'cancelled'].includes(store.status)) return null;
  user.lastLoginAt = now(); user.updatedAt = now(); await write(key('user', user.id), user, context); return { user, membership, store };
}

export async function createSession(session: PlatformSession, context?: RuntimeContext) { const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''); await write(key('session', token), session, context, 60 * 60 * 8); return token; }
export async function getSession(token: string | undefined, context?: RuntimeContext) { return token ? read<PlatformSession>(key('session', token), context) : null; }
export async function clearSession(token: string | undefined, context?: RuntimeContext) { const kv = await binding(context); if (token) { if (kv) await kv.delete(key('session', token)); else memory.delete(key('session', token)); } }

export async function requireStoreAccess(userId: string, storeId: string, context?: RuntimeContext) {
  const membership = await getMembership(userId, storeId, context); if (!membership || membership.status !== 'active') return null;
  const store = await getStore(storeId, context); return store && !['suspended', 'cancelled'].includes(store.status) ? { membership, store } : null;
}
