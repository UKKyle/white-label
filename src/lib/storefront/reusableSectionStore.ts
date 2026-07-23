import { getAdapterEnv, type RuntimeContext } from '../runtimeEnv';
import type { SectionInstance } from '../../types/storefront';

type Kv = { get(key: string, type?: 'json'): Promise<unknown>; put(key: string, value: string): Promise<void>; delete(key: string): Promise<void> };
const memory = new Map<string, string>();
const PREFIX = 'wl:v1:reusable-sections:';

export type ReusableSection = {
  id: string;
  storeId: string;
  name: string;
  section: SectionInstance;
  createdAt: string;
  updatedAt: string;
};

function key(...parts: string[]) { return PREFIX + parts.join(':'); }
function clean(value: unknown, max = 120) { return String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max); }
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

export async function listReusableSections(storeId: string, context?: RuntimeContext) {
  const ids = await read<string[]>(key(storeId, 'index'), context) ?? [];
  return (await Promise.all(ids.map((id) => read<ReusableSection>(key(storeId, 'item', id), context))))
    .filter((item): item is ReusableSection => Boolean(item && item.storeId === storeId));
}

export async function getReusableSection(storeId: string, reusableId: string, context?: RuntimeContext) {
  const item = await read<ReusableSection>(key(storeId, 'item', reusableId), context);
  return item?.storeId === storeId ? item : null;
}

export async function saveReusableSection(storeId: string, name: string, section: SectionInstance, context?: RuntimeContext) {
  const safeName = clean(name || section.label);
  if (!safeName) throw new Error('Name the reusable section.');
  const createdAt = new Date().toISOString();
  const item: ReusableSection = {
    id: `reusable_${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`,
    storeId,
    name: safeName,
    section: JSON.parse(JSON.stringify(section)) as SectionInstance,
    createdAt,
    updatedAt: createdAt,
  };
  const index = await read<string[]>(key(storeId, 'index'), context) ?? [];
  await Promise.all([
    write(key(storeId, 'item', item.id), item, context),
    write(key(storeId, 'index'), [item.id, ...index].slice(0, 60), context),
  ]);
  return item;
}

export async function deleteReusableSection(storeId: string, reusableId: string, context?: RuntimeContext) {
  const item = await getReusableSection(storeId, reusableId, context);
  if (!item) throw new Error('Reusable section not found.');
  const index = await read<string[]>(key(storeId, 'index'), context) ?? [];
  const kv = await binding(context);
  if (kv) await kv.delete(key(storeId, 'item', reusableId));
  else memory.delete(key(storeId, 'item', reusableId));
  await write(key(storeId, 'index'), index.filter((id) => id !== reusableId), context);
}
