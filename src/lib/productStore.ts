import { products as defaultProducts } from '../data/site';
import { businessConfig } from '../config/business';
import type { Product, ProductVariant } from '../types/shop';
import { base64ToBytes, validateManagedImageFile, type StoredManagedImage } from './imageStore';
import type { RuntimeEnv } from './runtimeEnv';

const PRODUCT_KEY_PREFIX = 'bbm:store:products:record:';
const PRODUCT_IMAGE_KEY_PREFIX = 'bbm:store:products:image:';
const PRODUCT_INDEX_KEY = 'bbm:store:products:index';
const MEMORY_STORE_KEY = '__BBM_PRODUCT_MEMORY_STORE__';

type KVNamespaceLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

type MemoryStore = {
  products: Map<string, StoredProductOverride>;
  images: Map<string, StoredProductImage>;
  customProductSlugs: Set<string>;
};

export type StoredProductOverride = {
  slug: string;
  name: string;
  category: string;
  tagline: string;
  price: number;
  enquireOnly?: boolean;
  image?: string;
  imageAlt: string;
  description: string;
  features: string[];
  variants?: ProductVariant[];
  accent?: string;
  glow?: string;
  isCustom?: boolean;
  updatedAt: string;
};

export type StoredProductImage = {
  slug: string;
  contentType: StoredManagedImage['contentType'];
  base64: string;
  size: number;
  originalName: string;
  updatedAt: string;
};

export type OnlineStoreProduct = Product & {
  status: 'Active';
  path: string;
  updatedAt?: string;
  hasCmsOverride: boolean;
};

export type ProductSaveInput = Omit<StoredProductOverride, 'slug' | 'updatedAt'>;

export class ProductStoreConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductStoreConfigError';
  }
}

export class ProductValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductValidationError';
  }
}

function isKvNamespace(value: unknown): value is KVNamespaceLike {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as KVNamespaceLike).get === 'function' &&
      typeof (value as KVNamespaceLike).put === 'function'
  );
}

function getMemoryStore(): MemoryStore {
  const globalScope = globalThis as typeof globalThis & {
    [MEMORY_STORE_KEY]?: MemoryStore;
  };

  if (!globalScope[MEMORY_STORE_KEY]) {
    globalScope[MEMORY_STORE_KEY] = {
      products: new Map<string, StoredProductOverride>(),
      images: new Map<string, StoredProductImage>(),
      customProductSlugs: new Set<string>(),
    };
  }

  return globalScope[MEMORY_STORE_KEY] as MemoryStore;
}

function getProductStoreBinding(env: RuntimeEnv) {
  if (isKvNamespace(env.SESSION)) {
    return env.SESSION;
  }

  return isKvNamespace(env.ORDERS) ? env.ORDERS : null;
}

function isProductionRuntime(env: RuntimeEnv) {
  return env.MODE === 'production' || env.DEV === false;
}

function requireProductStoreBinding(env: RuntimeEnv) {
  const binding = getProductStoreBinding(env);

  if (!binding && isProductionRuntime(env)) {
    throw new ProductStoreConfigError('Persistent product storage is not configured.');
  }

  return binding;
}

function productKey(slug: string) {
  return `${PRODUCT_KEY_PREFIX}${slug}`;
}

function productImageKey(slug: string) {
  return `${PRODUCT_IMAGE_KEY_PREFIX}${slug}`;
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function cleanText(value: unknown, maxLength = 1200) {
  return String(value ?? '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength);
}

function cleanSlug(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function createProductSlug(name: string) {
  return cleanSlug(name) || `product-${Date.now()}`;
}

function cleanHexColor(value: unknown, fallback: string) {
  const color = cleanText(value, 20);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function cleanList(values: unknown) {
  return Array.isArray(values)
    ? values.map((value) => cleanText(value, 180)).filter(Boolean).slice(0, 12)
    : [];
}

function cleanVariants(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const variants = value
    .map((item): ProductVariant | null => {
      const record = item && typeof item === 'object' ? item as Partial<ProductVariant> : {};
      const price = Number(record.price);

      if (!Number.isFinite(price) || price <= 0) {
        return null;
      }

      const variant: ProductVariant = {
        price: Math.round(price * 100) / 100,
      };

      const flavour = cleanText(record.flavour, 80);
      const servingSize = cleanText(record.servingSize, 80);

      if (flavour) variant.flavour = flavour;
      if (servingSize) variant.servingSize = servingSize;

      return variant;
    })
    .filter((item): item is ProductVariant => item !== null)
    .slice(0, 24);

  return variants.length ? variants : undefined;
}

function normalizeStoredOverride(value: unknown, slug: string): StoredProductOverride | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Partial<StoredProductOverride>;
  const price = Number(record.price);
  const updatedAt = cleanText(record.updatedAt, 60);

  if (!updatedAt || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  const normalized: StoredProductOverride = {
    slug,
    name: cleanText(record.name, 120),
    category: cleanText(record.category, 120),
    tagline: cleanText(record.tagline, 220),
    price: Math.round(price * 100) / 100,
    enquireOnly: Boolean(record.enquireOnly),
    image: cleanText(record.image, 500),
    imageAlt: cleanText(record.imageAlt, 160),
    description: cleanText(record.description, 1200),
    features: cleanList(record.features),
    variants: cleanVariants(record.variants),
    accent: cleanHexColor(record.accent, '#ff4cc7'),
    glow: cleanHexColor(record.glow, '#ffd3e3'),
    isCustom: Boolean(record.isCustom),
    updatedAt,
  };

  if (!normalized.name || !normalized.category || !normalized.tagline || !normalized.description) {
    return null;
  }

  return normalized;
}

function normalizeStoredImage(value: unknown, slug: string): StoredProductImage | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Partial<StoredProductImage>;
  const contentType = String(record.contentType ?? '');
  const base64 = String(record.base64 ?? '');
  const updatedAt = String(record.updatedAt ?? '');

  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(contentType) || !base64 || !updatedAt) {
    return null;
  }

  return {
    slug,
    contentType: contentType as StoredProductImage['contentType'],
    base64,
    size: Math.max(0, Number(record.size) || 0),
    originalName: String(record.originalName ?? '').slice(0, 160),
    updatedAt,
  };
}

function getDefaultProduct(slug: string) {
  return defaultProducts.find((product) => product.slug === slug) ?? null;
}

function mergeProduct(product: Product, override: StoredProductOverride | null): OnlineStoreProduct {
  return {
    ...product,
    ...(override
      ? {
          name: override.name,
          category: override.category,
          tagline: override.tagline,
          price: override.price,
          enquireOnly: override.enquireOnly,
          image: override.image || product.image,
          imageAlt: override.imageAlt,
          description: override.description,
          features: override.features,
          variants: override.variants,
          accent: override.accent || product.accent,
          glow: override.glow || product.glow,
        }
      : {}),
    status: 'Active',
    path: `/products/${product.slug}`,
    updatedAt: override?.updatedAt,
    hasCmsOverride: Boolean(override),
  };
}

function productFromCustomRecord(record: StoredProductOverride): OnlineStoreProduct {
  return {
    slug: record.slug,
    name: record.name,
    category: record.category,
    tagline: record.tagline,
    price: record.price,
    enquireOnly: Boolean(record.enquireOnly),
    accent: record.accent || '#ff4cc7',
    glow: record.glow || '#ffd3e3',
    image: record.image || businessConfig.branding.logoPath,
    imageAlt: record.imageAlt,
    description: record.description,
    features: record.features,
    variants: record.variants,
    status: 'Active',
    path: `/products/${record.slug}`,
    updatedAt: record.updatedAt,
    hasCmsOverride: true,
  };
}

export function productEditableDefaults(product: Product): ProductSaveInput {
  return {
    name: product.name,
    category: product.category,
    tagline: product.tagline,
    price: product.price,
    enquireOnly: Boolean(product.enquireOnly),
    image: product.image,
    imageAlt: product.imageAlt,
    description: product.description,
    features: [...product.features],
    variants: product.variants ? product.variants.map((variant) => ({ ...variant })) : undefined,
    accent: product.accent,
    glow: product.glow,
  };
}

export async function getStoredProductOverride(env: RuntimeEnv, slug: string) {
  const kv = requireProductStoreBinding(env);

  if (!kv) {
    return getMemoryStore().products.get(slug) ?? null;
  }

  return normalizeStoredOverride(safeJsonParse<StoredProductOverride>(await kv.get(productKey(slug))), slug);
}

async function listCustomProductSlugs(env: RuntimeEnv) {
  const kv = requireProductStoreBinding(env);

  if (!kv) {
    return [...getMemoryStore().customProductSlugs];
  }

  const slugs = safeJsonParse<string[]>(await kv.get(PRODUCT_INDEX_KEY));
  return Array.isArray(slugs) ? slugs.map(cleanSlug).filter(Boolean) : [];
}

async function saveCustomProductIndex(env: RuntimeEnv, slugs: string[]) {
  const uniqueSlugs = [...new Set(slugs.map(cleanSlug).filter(Boolean))].filter((slug) => !getDefaultProduct(slug));
  const kv = requireProductStoreBinding(env);

  if (!kv) {
    getMemoryStore().customProductSlugs = new Set(uniqueSlugs);
    return uniqueSlugs;
  }

  await kv.put(PRODUCT_INDEX_KEY, JSON.stringify(uniqueSlugs));
  return uniqueSlugs;
}

export async function listOnlineStoreProducts(env: RuntimeEnv) {
  const products = await Promise.all(
    defaultProducts.map(async (product) => {
      try {
        return mergeProduct(product, await getStoredProductOverride(env, product.slug));
      } catch {
        return mergeProduct(product, null);
      }
    })
  );

  const customProducts = await Promise.all(
    (await listCustomProductSlugs(env)).map(async (slug) => {
      const record = await getStoredProductOverride(env, slug);
      return record?.isCustom ? productFromCustomRecord(record) : null;
    })
  );

  return [...products, ...customProducts.filter((product): product is OnlineStoreProduct => product !== null)];
}

export async function getOnlineStoreProduct(env: RuntimeEnv, slug: string) {
  const product = getDefaultProduct(slug);

  if (product) {
    try {
      return mergeProduct(product, await getStoredProductOverride(env, slug));
    } catch {
      return mergeProduct(product, null);
    }
  }

  try {
    const record = await getStoredProductOverride(env, slug);
    return record?.isCustom ? productFromCustomRecord(record) : null;
  } catch {
    return null;
  }
}

function buildProductRecord(slug: string, product: Product | null, input: ProductSaveInput, isCustom: boolean) {
  const price = Number(input.price);
  const defaults = product ? productEditableDefaults(product) : {
    name: '',
    category: '',
    tagline: '',
    price: 0,
    enquireOnly: false,
    image: businessConfig.branding.logoPath,
    imageAlt: '',
    description: '',
    features: [],
    variants: undefined,
    accent: '#ff4cc7',
    glow: '#ffd3e3',
  };
  const record: StoredProductOverride = {
    ...defaults,
    ...input,
    slug,
    name: cleanText(input.name, 120),
    category: cleanText(input.category, 120),
    tagline: cleanText(input.tagline, 220),
    price: Number.isFinite(price) ? Math.round(price * 100) / 100 : 0,
    enquireOnly: Boolean(input.enquireOnly),
    image: cleanText(input.image || defaults.image, 500),
    imageAlt: cleanText(input.imageAlt, 160),
    description: cleanText(input.description, 1200),
    features: cleanList(input.features),
    variants: cleanVariants(input.variants),
    accent: cleanHexColor(input.accent, defaults.accent || '#ff4cc7'),
    glow: cleanHexColor(input.glow, defaults.glow || '#ffd3e3'),
    isCustom,
    updatedAt: new Date().toISOString(),
  };

  if (!record.name || !record.category || !record.tagline || !record.description) {
    throw new ProductValidationError('Product name, category, tagline, and description are required.');
  }

  if (record.price <= 0) {
    throw new ProductValidationError('Product price must be greater than zero.');
  }

  if (!record.features.length) {
    record.features = product ? [...product.features] : ['Made to order'];
  }

  return record;
}

async function putProductRecord(env: RuntimeEnv, record: StoredProductOverride) {
  const kv = requireProductStoreBinding(env);

  if (!kv) {
    getMemoryStore().products.set(record.slug, record);
    return record;
  }

  await kv.put(productKey(record.slug), JSON.stringify(record));
  return record;
}

export async function saveOnlineStoreProduct(env: RuntimeEnv, slug: string, input: ProductSaveInput) {
  const product = getDefaultProduct(slug);

  if (product) {
    return putProductRecord(env, buildProductRecord(slug, product, input, false));
  }

  const existing = await getStoredProductOverride(env, slug);

  if (!existing?.isCustom) {
    throw new ProductValidationError('Choose an existing online store product.');
  }

  return putProductRecord(env, buildProductRecord(slug, null, input, true));
}

export async function getAvailableProductSlug(env: RuntimeEnv, name: string, preferredSlug?: string) {
  const baseSlug = cleanSlug(preferredSlug) || createProductSlug(name);
  const existingSlugs = new Set((await listOnlineStoreProducts(env)).map((product) => product.slug));
  let slug = baseSlug;
  let counter = 2;

  while (existingSlugs.has(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return slug;
}

export async function createOnlineStoreProduct(env: RuntimeEnv, input: ProductSaveInput, preferredSlug?: string) {
  const slug = await getAvailableProductSlug(env, input.name, preferredSlug);
  const record = await putProductRecord(env, buildProductRecord(slug, null, input, true));
  await saveCustomProductIndex(env, [...await listCustomProductSlugs(env), slug]);
  return record;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

export async function saveOnlineStoreProductImage(env: RuntimeEnv, slug: string, file: File) {
  const buffer = await validateManagedImageFile(file);
  const record: StoredProductImage = {
    slug,
    contentType: file.type as StoredProductImage['contentType'],
    base64: arrayBufferToBase64(buffer),
    size: file.size,
    originalName: file.name.slice(0, 160),
    updatedAt: new Date().toISOString(),
  };

  const kv = requireProductStoreBinding(env);

  if (!kv) {
    getMemoryStore().images.set(slug, record);
    return record;
  }

  await kv.put(productImageKey(slug), JSON.stringify(record));
  return record;
}

export async function getOnlineStoreProductImage(env: RuntimeEnv, slug: string) {
  const kv = requireProductStoreBinding(env);

  if (!kv) {
    return getMemoryStore().images.get(slug) ?? null;
  }

  return normalizeStoredImage(safeJsonParse<StoredProductImage>(await kv.get(productImageKey(slug))), slug);
}

export function productImagePath(slug: string, updatedAt?: string) {
  const query = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : '';
  return `/product-images/${encodeURIComponent(slug)}${query}`;
}

export function productImageBytes(image: StoredProductImage) {
  return base64ToBytes(image.base64);
}
