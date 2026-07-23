import { getAdapterEnv, type RuntimeContext } from '../runtimeEnv';

type Kv = { get(key: string, type?: 'json'): Promise<unknown>; put(key: string, value: string): Promise<void>; delete(key: string): Promise<void> };
const memory = new Map<string, string>();
const PREFIX = 'wl:v1:assets:';
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const MAX_BYTES = 4 * 1024 * 1024;

export type StoreAsset = {
  id: string;
  storeId: string;
  name: string;
  alt: string;
  contentType: string;
  bytes: number;
  base64: string;
  createdAt: string;
};

function key(...parts: string[]) { return PREFIX + parts.join(':'); }
function clean(value: unknown, max = 180) { return String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max); }
function matchesContentType(bytes: Uint8Array, contentType: string) {
  if (contentType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/png') return bytes.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  if (contentType === 'image/webp') return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (contentType === 'image/avif') return String.fromCharCode(...bytes.slice(4, 12)).includes('ftyp');
  return false;
}
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

export async function listStoreAssets(storeId: string, context?: RuntimeContext) {
  const ids = await read<string[]>(key(storeId, 'index'), context) ?? [];
  return (await Promise.all(ids.map((assetId) => read<StoreAsset>(key(storeId, 'asset', assetId), context))))
    .filter((asset): asset is StoreAsset => Boolean(asset && asset.storeId === storeId));
}

export async function getStoreAsset(storeId: string, assetId: string, context?: RuntimeContext) {
  const asset = await read<StoreAsset>(key(storeId, 'asset', assetId), context);
  return asset?.storeId === storeId ? asset : null;
}

export async function createStoreAsset(storeId: string, file: File, input: { name?: string; alt?: string }, context?: RuntimeContext) {
  if (!ALLOWED.has(file.type)) throw new Error('Use a JPG, PNG, WebP or AVIF image.');
  if (file.size <= 0 || file.size > MAX_BYTES) throw new Error('Images must be smaller than 4 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesContentType(bytes, file.type)) throw new Error('The selected file does not match its image type.');
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  const id = `asset_${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`;
  const asset: StoreAsset = { id, storeId, name: clean(input.name || file.name), alt: clean(input.alt), contentType: file.type, bytes: file.size, base64: btoa(binary), createdAt: new Date().toISOString() };
  const index = await read<string[]>(key(storeId, 'index'), context) ?? [];
  await Promise.all([write(key(storeId, 'asset', id), asset, context), write(key(storeId, 'index'), [id, ...index], context)]);
  return asset;
}
