import type { RuntimeEnv } from './runtimeEnv';

const POS_PRODUCTS_INDEX_KEY = 'bbm:pos:products:index';
const POS_PRODUCT_KEY_PREFIX = 'bbm:pos:products:record:';
const POS_PRODUCTS_SEED_KEY = 'bbm:pos:products:seeded';

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

export type PosProductStatus = 'active' | 'draft' | 'deleted';

export type PosProduct = {
  id: string;
  name: string;
  pricePence: number;
  category: string;
  status: PosProductStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PosProductInput = {
  name: string;
  price: string;
  category?: string;
  status?: string;
  sortOrder?: string;
};

export class PosProductsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PosProductsConfigError';
  }
}

export const fallbackPosProducts: PosProduct[] = [
  {
    id: 'pos-fallback-brownie-box',
    name: 'Chocolate Brownie Box',
    pricePence: 1200,
    category: 'Brownies',
    status: 'active',
    sortOrder: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'pos-fallback-cupcake-box',
    name: 'Vanilla Cupcake Box',
    pricePence: 1500,
    category: 'Cupcakes',
    status: 'active',
    sortOrder: 20,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'pos-fallback-cake-deposit',
    name: 'Custom Cake Deposit',
    pricePence: 2000,
    category: '',
    status: 'active',
    sortOrder: 30,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'pos-fallback-delivery-fee',
    name: 'Delivery Fee',
    pricePence: 500,
    category: '',
    status: 'active',
    sortOrder: 40,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const seedProducts: PosProductInput[] = [
  { name: 'Chocolate Brownie Box', price: '12', category: 'Brownies', status: 'active', sortOrder: '10' },
  { name: 'Vanilla Cupcake Box', price: '15', category: 'Cupcakes', status: 'active', sortOrder: '20' },
  { name: 'Custom Cake Deposit', price: '20', category: '', status: 'active', sortOrder: '30' },
  { name: 'Delivery Fee', price: '5', category: '', status: 'active', sortOrder: '40' },
];

function isKvNamespace(value: unknown): value is KVNamespaceLike {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as KVNamespaceLike).get === 'function' &&
      typeof (value as KVNamespaceLike).put === 'function' &&
      typeof (value as KVNamespaceLike).list === 'function'
  );
}

function getPosProductsBinding(env: RuntimeEnv) {
  if (isKvNamespace(env.ORDERS)) {
    return env.ORDERS;
  }

  return isKvNamespace(env.SESSION) ? env.SESSION : null;
}

function isProductionRuntime(env: RuntimeEnv) {
  return env.MODE === 'production' || env.DEV === false;
}

function requirePosProductsBinding(env: RuntimeEnv) {
  const binding = getPosProductsBinding(env);

  if (!binding && isProductionRuntime(env)) {
    throw new PosProductsConfigError('Persistent POS product storage is not configured.');
  }

  return binding;
}

function productKey(id: string) {
  return `${POS_PRODUCT_KEY_PREFIX}${id}`;
}

function safeJsonParse<T>(value: string | null) {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function normalizeId(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function createProductId() {
  return `pos-product-${crypto.randomUUID().slice(0, 12)}`;
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeStatus(value: unknown): PosProductStatus {
  return String(value ?? '').trim().toLowerCase() === 'draft' ? 'draft' : 'active';
}

function normalizePricePence(value: unknown) {
  const text = String(value ?? '').replace(/[£,\s]/g, '');
  const amount = Number(text);

  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  return Math.round(amount * 100);
}

function normalizeSortOrder(value: unknown) {
  const sortOrder = Number(value);

  if (!Number.isFinite(sortOrder)) {
    return 0;
  }

  return Math.max(-999_999, Math.min(999_999, Math.round(sortOrder)));
}

function normalizeStoredProduct(value: PosProduct | null) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const id = normalizeId(String(value.id ?? ''));
  const name = normalizeText(value.name, 160);
  const pricePence = Number(value.pricePence);
  const status = value.status === 'draft' || value.status === 'deleted' ? value.status : 'active';

  if (!id || !name || !Number.isFinite(pricePence) || pricePence <= 0) {
    return null;
  }

  return {
    id,
    name,
    pricePence: Math.round(pricePence),
    category: normalizeText(value.category, 120),
    status,
    sortOrder: normalizeSortOrder(value.sortOrder),
    createdAt: normalizeText(value.createdAt, 64) || new Date().toISOString(),
    updatedAt: normalizeText(value.updatedAt, 64) || new Date().toISOString(),
  } satisfies PosProduct;
}

function validateProductInput(input: PosProductInput) {
  const name = normalizeText(input.name, 160);
  const pricePence = normalizePricePence(input.price);

  if (!name) {
    throw new Error('Product name is required.');
  }

  if (pricePence <= 0) {
    throw new Error('Product price must be a positive number.');
  }

  return {
    name,
    pricePence,
    category: normalizeText(input.category, 120),
    status: normalizeStatus(input.status),
    sortOrder: normalizeSortOrder(input.sortOrder),
  };
}

async function readProductIndex(kv: KVNamespaceLike) {
  const parsed = safeJsonParse<string[]>(await kv.get(POS_PRODUCTS_INDEX_KEY));

  return Array.isArray(parsed) ? parsed.map((id) => normalizeId(String(id))).filter(Boolean) : [];
}

async function writeProductIndex(kv: KVNamespaceLike, ids: string[]) {
  await kv.put(POS_PRODUCTS_INDEX_KEY, JSON.stringify([...new Set(ids.map(normalizeId).filter(Boolean))]));
}

async function readProduct(env: RuntimeEnv, id: string) {
  const kv = requirePosProductsBinding(env);
  const normalizedId = normalizeId(id);

  if (!kv || !normalizedId) {
    return null;
  }

  return normalizeStoredProduct(safeJsonParse<PosProduct>(await kv.get(productKey(normalizedId))));
}

async function writeProduct(kv: KVNamespaceLike, product: PosProduct) {
  await kv.put(productKey(product.id), JSON.stringify(product));
}

export async function ensureDefaultPosProducts(env: RuntimeEnv) {
  const kv = requirePosProductsBinding(env);

  if (!kv) {
    return;
  }

  const [seeded, index] = await Promise.all([
    kv.get(POS_PRODUCTS_SEED_KEY),
    readProductIndex(kv),
  ]);

  if (seeded || index.length > 0) {
    return;
  }

  const created: PosProduct[] = seedProducts.map((input) => {
    const now = new Date().toISOString();
    const validated = validateProductInput(input);

    return {
      id: createProductId(),
      ...validated,
      createdAt: now,
      updatedAt: now,
    };
  });

  await Promise.all(created.map((product) => writeProduct(kv, product)));
  await writeProductIndex(kv, created.map((product) => product.id));
  await kv.put(POS_PRODUCTS_SEED_KEY, new Date().toISOString());
}

export async function listPosProducts(env: RuntimeEnv, options: { includeDeleted?: boolean; seedIfEmpty?: boolean } = {}) {
  const kv = requirePosProductsBinding(env);

  if (!kv) {
    return [];
  }

  if (options.seedIfEmpty) {
    try {
      await ensureDefaultPosProducts(env);
    } catch {
      return fallbackPosProducts;
    }
  }

  let ids: string[] = [];

  try {
    ids = await readProductIndex(kv);
  } catch {
    return fallbackPosProducts;
  }

  if (!ids.length) {
    const keys: string[] = [];
    let cursor: string | undefined;

    try {
      do {
        const result = await kv.list({ prefix: POS_PRODUCT_KEY_PREFIX, cursor });
        cursor = result.list_complete ? undefined : result.cursor;
        keys.push(...result.keys.map((key) => key.name));
      } while (cursor);
    } catch {
      return fallbackPosProducts;
    }

    ids = keys.map((key) => key.replace(POS_PRODUCT_KEY_PREFIX, '')).filter(Boolean);

    if (ids.length) {
      try {
        await writeProductIndex(kv, ids);
      } catch {
        // The catalogue remains readable even when index repair cannot be persisted.
      }
    }
  }

  const products = await Promise.all(ids.map(async (id) => {
    try {
      return await readProduct(env, id);
    } catch {
      return null;
    }
  }));

  return products
    .filter((product): product is PosProduct => Boolean(product))
    .filter((product) => options.includeDeleted || product.status !== 'deleted')
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      return left.name.localeCompare(right.name);
    });
}

export async function createPosProduct(env: RuntimeEnv, input: PosProductInput) {
  const kv = requirePosProductsBinding(env);

  if (!kv) {
    throw new PosProductsConfigError('Persistent POS product storage is not configured.');
  }

  const now = new Date().toISOString();
  const product: PosProduct = {
    id: createProductId(),
    ...validateProductInput(input),
    createdAt: now,
    updatedAt: now,
  };
  const ids = await readProductIndex(kv);

  await writeProduct(kv, product);
  await writeProductIndex(kv, [...ids, product.id]);
  return product;
}

export async function updatePosProduct(env: RuntimeEnv, id: string, input: PosProductInput) {
  const kv = requirePosProductsBinding(env);
  const existing = await readProduct(env, id);

  if (!kv) {
    throw new PosProductsConfigError('Persistent POS product storage is not configured.');
  }

  if (!existing || existing.status === 'deleted') {
    throw new Error('POS product was not found.');
  }

  const next: PosProduct = {
    ...existing,
    ...validateProductInput(input),
    updatedAt: new Date().toISOString(),
  };

  await writeProduct(kv, next);
  return next;
}

export async function deletePosProduct(env: RuntimeEnv, id: string) {
  const kv = requirePosProductsBinding(env);
  const existing = await readProduct(env, id);

  if (!kv) {
    throw new PosProductsConfigError('Persistent POS product storage is not configured.');
  }

  if (!existing) {
    return null;
  }

  const next: PosProduct = {
    ...existing,
    status: 'deleted',
    updatedAt: new Date().toISOString(),
  };

  await writeProduct(kv, next);
  return next;
}
