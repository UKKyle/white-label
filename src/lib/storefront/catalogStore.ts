import { getAdapterEnv, type RuntimeContext } from '../runtimeEnv';
import { getStoreAsset } from './assetStore';

type Kv = { get(key: string, type?: 'json'): Promise<unknown>; put(key: string, value: string): Promise<void>; delete(key: string): Promise<void> };
const memory = new Map<string, string>();
const PREFIX = 'wl:v1:catalog:';

export type CatalogProduct = {
  id: string;
  storeId: string;
  name: string;
  slug: string;
  description: string;
  pricePence: number;
  inventory: number;
  category: string;
  status: 'active' | 'draft';
  imageAssetId?: string;
  createdAt: string;
  updatedAt: string;
};

export type CatalogProductInput = {
  name: string;
  slug: string;
  description?: string;
  price: string;
  inventory?: string;
  category?: string;
  status?: string;
  imageAssetId?: string;
};

function key(...parts: string[]) { return PREFIX + parts.join(':'); }
function clean(value: unknown, max = 240) { return String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max); }
function slugify(value: unknown) { return clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
function now() { return new Date().toISOString(); }
function id() { return `product_${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`; }
async function binding(context?: RuntimeContext): Promise<Kv | null> {
  const candidate = getAdapterEnv(context).SESSION as Kv | undefined;
  return candidate && typeof candidate.get === 'function' && typeof candidate.put === 'function' ? candidate : null;
}
async function read<T>(name: string, context?: RuntimeContext): Promise<T | null> {
  const kv = await binding(context); const value = kv ? await kv.get(name) : memory.get(name);
  if (!value) return null;
  try { return typeof value === 'string' ? JSON.parse(value) as T : value as T; } catch { return null; }
}
async function write<T>(name: string, value: T, context?: RuntimeContext) {
  const body = JSON.stringify(value); const kv = await binding(context);
  if (kv) await kv.put(name, body); else memory.set(name, body);
}
function validate(storeId: string, input: CatalogProductInput) {
  const name = clean(input.name, 160);
  const slug = slugify(input.slug || name);
  const amount = Number(String(input.price).replace(/[£,\s]/g, ''));
  if (!name) throw new Error('Enter a product name.');
  if (!slug) throw new Error('Enter a valid product URL.');
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Enter a valid product price.');
  return {
    storeId,
    name,
    slug,
    description: clean(input.description, 2000),
    pricePence: Math.round(amount * 100),
    inventory: Math.max(0, Math.round(Number(input.inventory ?? 0) || 0)),
    category: clean(input.category, 100),
    status: input.status === 'active' ? 'active' as const : 'draft' as const,
    imageAssetId: clean(input.imageAssetId, 80) || undefined,
  };
}

export async function listCatalogProducts(storeId: string, context?: RuntimeContext) {
  const ids = await read<string[]>(key(storeId, 'index'), context) ?? [];
  return (await Promise.all(ids.map((productId) => read<CatalogProduct>(key(storeId, 'product', productId), context))))
    .filter((product): product is CatalogProduct => Boolean(product && product.storeId === storeId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getCatalogProduct(storeId: string, productId: string, context?: RuntimeContext) {
  const product = await read<CatalogProduct>(key(storeId, 'product', productId), context);
  return product?.storeId === storeId ? product : null;
}

export async function createCatalogProduct(storeId: string, input: CatalogProductInput, context?: RuntimeContext) {
  const values = validate(storeId, input);
  if (values.imageAssetId && !await getStoreAsset(storeId, values.imageAssetId, context)) throw new Error('Choose an image from this store’s asset library.');
  const products = await listCatalogProducts(storeId, context);
  if (products.some((product) => product.slug === values.slug)) throw new Error('That product URL is already in use.');
  const createdAt = now();
  const product: CatalogProduct = { id: id(), ...values, createdAt, updatedAt: createdAt };
  const index = await read<string[]>(key(storeId, 'index'), context) ?? [];
  await Promise.all([write(key(storeId, 'product', product.id), product, context), write(key(storeId, 'index'), [product.id, ...index], context)]);
  return product;
}

export async function updateCatalogProduct(storeId: string, productId: string, input: CatalogProductInput, context?: RuntimeContext) {
  const existing = await getCatalogProduct(storeId, productId, context);
  if (!existing) throw new Error('Product not found.');
  const values = validate(storeId, input);
  if (values.imageAssetId && !await getStoreAsset(storeId, values.imageAssetId, context)) throw new Error('Choose an image from this store’s asset library.');
  const products = await listCatalogProducts(storeId, context);
  if (products.some((product) => product.id !== productId && product.slug === values.slug)) throw new Error('That product URL is already in use.');
  const product: CatalogProduct = { ...existing, ...values, updatedAt: now() };
  await write(key(storeId, 'product', product.id), product, context);
  return product;
}
