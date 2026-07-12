import { getManagedImageDefinition, managedImagePath, type ManagedImageId } from './managedImages';
import type { RuntimeEnv } from './runtimeEnv';

const IMAGE_KEY_PREFIX = 'bbm:images:record:';
const MEMORY_STORE_KEY = '__BBM_IMAGE_MEMORY_STORE__';
export const MAX_IMAGE_UPLOAD_BYTES = 4 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

export type StoredManagedImage = {
  id: ManagedImageId;
  contentType: typeof ALLOWED_IMAGE_TYPES[number];
  base64: string;
  size: number;
  originalName: string;
  updatedAt: string;
};

export type ManagedImageView = {
  id: ManagedImageId;
  label: string;
  usage: string;
  alt: string;
  fallbackSrc: string;
  currentSrc: string;
  hasReplacement: boolean;
  updatedAt?: string;
  originalName?: string;
  size?: number;
};

type KVNamespaceLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

type MemoryStore = {
  images: Map<string, StoredManagedImage>;
};

export class ImageStoreConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageStoreConfigError';
  }
}

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageValidationError';
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
      images: new Map<string, StoredManagedImage>(),
    };
  }

  return globalScope[MEMORY_STORE_KEY] as MemoryStore;
}

function getImageStoreBinding(env: RuntimeEnv) {
  if (isKvNamespace(env.SESSION)) {
    return env.SESSION;
  }

  return isKvNamespace(env.ORDERS) ? env.ORDERS : null;
}

function isProductionRuntime(env: RuntimeEnv) {
  return env.MODE === 'production' || env.DEV === false;
}

function requireImageStoreBinding(env: RuntimeEnv) {
  const binding = getImageStoreBinding(env);

  if (!binding && isProductionRuntime(env)) {
    throw new ImageStoreConfigError('Persistent image storage is not configured.');
  }

  return binding;
}

function imageKey(id: string) {
  return `${IMAGE_KEY_PREFIX}${id}`;
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function normalizeStoredImage(value: unknown): StoredManagedImage | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Partial<StoredManagedImage>;
  const definition = getManagedImageDefinition(String(record.id ?? ''));
  const contentType = String(record.contentType ?? '');
  const base64 = String(record.base64 ?? '');
  const updatedAt = String(record.updatedAt ?? '');

  if (!definition || !ALLOWED_IMAGE_TYPES.includes(contentType as StoredManagedImage['contentType']) || !base64 || !updatedAt) {
    return null;
  }

  return {
    id: definition.id as ManagedImageId,
    contentType: contentType as StoredManagedImage['contentType'],
    base64,
    size: Math.max(0, Number(record.size) || 0),
    originalName: String(record.originalName ?? ''),
    updatedAt,
  };
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

export function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function hasValidMagicBytes(bytes: Uint8Array, contentType: string) {
  if (contentType === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (contentType === 'image/png') {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }

  if (contentType === 'image/webp') {
    return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }

  if (contentType === 'image/avif') {
    return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
  }

  return false;
}

export async function validateManagedImageFile(file: File) {
  if (!file || file.size <= 0) {
    throw new ImageValidationError('Choose an image file before saving.');
  }

  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new ImageValidationError('Image must be 4 MB or smaller.');
  }

  if (!ALLOWED_IMAGE_TYPES.includes(file.type as StoredManagedImage['contentType'])) {
    throw new ImageValidationError('Use a JPG, PNG, WebP, or AVIF image.');
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer.slice(0, 16));

  if (!hasValidMagicBytes(bytes, file.type)) {
    throw new ImageValidationError('The selected file does not look like a valid image.');
  }

  return buffer;
}

export async function getStoredManagedImage(env: RuntimeEnv, id: string) {
  const definition = getManagedImageDefinition(id);

  if (!definition) {
    return null;
  }

  const kv = requireImageStoreBinding(env);

  if (!kv) {
    return getMemoryStore().images.get(id) ?? null;
  }

  return normalizeStoredImage(safeJsonParse<StoredManagedImage>(await kv.get(imageKey(id))));
}

export async function getManagedImageSrc(env: RuntimeEnv, id: ManagedImageId) {
  const definition = getManagedImageDefinition(id);

  if (!definition) {
    return '';
  }

  try {
    const stored = await getStoredManagedImage(env, id);
    return stored ? managedImagePath(id, stored.updatedAt) : definition.fallbackSrc;
  } catch {
    return definition.fallbackSrc;
  }
}

export async function buildManagedImageView(env: RuntimeEnv, id: ManagedImageId): Promise<ManagedImageView | null> {
  const definition = getManagedImageDefinition(id);

  if (!definition) {
    return null;
  }

  let stored: StoredManagedImage | null = null;

  try {
    stored = await getStoredManagedImage(env, id);
  } catch {
    stored = null;
  }

  return {
    id,
    label: definition.label,
    usage: definition.usage,
    alt: definition.alt,
    fallbackSrc: definition.fallbackSrc,
    currentSrc: stored ? managedImagePath(id, stored.updatedAt) : definition.fallbackSrc,
    hasReplacement: Boolean(stored),
    updatedAt: stored?.updatedAt,
    originalName: stored?.originalName,
    size: stored?.size,
  };
}

export async function saveManagedImage(env: RuntimeEnv, id: string, file: File) {
  const definition = getManagedImageDefinition(id);

  if (!definition) {
    throw new ImageValidationError('Choose a valid live-site image to replace.');
  }

  const buffer = await validateManagedImageFile(file);

  const record: StoredManagedImage = {
    id: definition.id as ManagedImageId,
    contentType: file.type as StoredManagedImage['contentType'],
    base64: arrayBufferToBase64(buffer),
    size: file.size,
    originalName: file.name.slice(0, 160),
    updatedAt: new Date().toISOString(),
  };

  const kv = requireImageStoreBinding(env);

  if (!kv) {
    getMemoryStore().images.set(definition.id, record);
    return record;
  }

  await kv.put(imageKey(definition.id), JSON.stringify(record));
  return record;
}
