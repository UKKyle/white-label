import type { RuntimeEnv } from './runtimeEnv';

const AVAILABILITY_KEY = 'bbm:availability:record';
const MEMORY_STORE_KEY = '__BBM_AVAILABILITY_MEMORY_STORE__';

type KVNamespaceLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

type StoredAvailability = {
  unavailableDates: string[];
  updatedAt: string;
};

type MemoryStore = {
  availability: StoredAvailability | null;
};

function isKvNamespace(value: unknown): value is KVNamespaceLike {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as KVNamespaceLike).get === 'function' &&
      typeof (value as KVNamespaceLike).put === 'function'
  );
}

function getAvailabilityBinding(env: RuntimeEnv) {
  if (isKvNamespace(env.ORDERS)) {
    return env.ORDERS;
  }

  return isKvNamespace(env.SESSION) ? env.SESSION : null;
}

function getMemoryStore(): MemoryStore {
  const globalScope = globalThis as typeof globalThis & {
    [MEMORY_STORE_KEY]?: MemoryStore;
  };

  if (!globalScope[MEMORY_STORE_KEY]) {
    globalScope[MEMORY_STORE_KEY] = {
      availability: null,
    };
  }

  return globalScope[MEMORY_STORE_KEY] as MemoryStore;
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function toDateString(value: unknown) {
  return String(value ?? '').trim().slice(0, 32);
}

export function isPlainDateString(value: unknown): value is string {
  const date = toDateString(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const [yearText, monthText, dayText] = date.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function normalizeUnavailableDates(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => toDateString(item)).filter((item): item is string => isPlainDateString(item)))].sort();
}

function normalizeStoredAvailability(value: unknown): StoredAvailability | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Partial<StoredAvailability>;
  const unavailableDates = normalizeUnavailableDates(record.unavailableDates);
  const updatedAt = String(record.updatedAt ?? '').trim().slice(0, 80);

  if (!updatedAt) {
    return null;
  }

  return {
    unavailableDates,
    updatedAt,
  };
}

export async function getAvailabilityRecord(env: RuntimeEnv) {
  const kv = getAvailabilityBinding(env);

  if (!kv) {
    return getMemoryStore().availability ?? {
      unavailableDates: [],
      updatedAt: '',
    };
  }

  const stored = normalizeStoredAvailability(safeJsonParse<StoredAvailability>(await kv.get(AVAILABILITY_KEY)));
  return stored ?? {
    unavailableDates: [],
    updatedAt: '',
  };
}

export async function listUnavailableDates(env: RuntimeEnv) {
  const record = await getAvailabilityRecord(env);
  return record.unavailableDates;
}

export async function saveUnavailableDates(env: RuntimeEnv, unavailableDates: string[]) {
  const record: StoredAvailability = {
    unavailableDates: normalizeUnavailableDates(unavailableDates),
    updatedAt: new Date().toISOString(),
  };

  const kv = getAvailabilityBinding(env);

  if (!kv) {
    getMemoryStore().availability = record;
    return record;
  }

  await kv.put(AVAILABILITY_KEY, JSON.stringify(record));
  return record;
}

export async function isUnavailableDate(env: RuntimeEnv, date: string) {
  if (!isPlainDateString(date)) {
    return false;
  }

  const unavailableDates = await listUnavailableDates(env);
  return unavailableDates.includes(date);
}
