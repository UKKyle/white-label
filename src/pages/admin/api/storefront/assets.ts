import type { APIRoute } from 'astro';
import { requireStoreMembership } from '../../../../lib/platform/auth';
import { createStoreAsset, deleteStoreAsset, listStoreAssets, updateStoreAsset } from '../../../../lib/storefront/assetStore';
import { listCatalogProducts } from '../../../../lib/storefront/catalogStore';
import { getDraftRevision } from '../../../../lib/storefront/themeStore';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function sameOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}
function publicAsset(asset: Awaited<ReturnType<typeof listStoreAssets>>[number], slug: string, usageCount = 0) {
  const { base64: _base64, ...metadata } = asset;
  return { ...metadata, usageCount, src: `/store-assets/${encodeURIComponent(slug)}/${encodeURIComponent(asset.id)}` };
}
async function assetUsage(storeId: string, context: Parameters<APIRoute>[0]) {
  const [draft, products] = await Promise.all([getDraftRevision(storeId, context), listCatalogProducts(storeId, context)]);
  const usage = new Map<string, Array<{ type: string; label: string }>>();
  for (const page of Object.values(draft?.configuration.pages ?? {})) {
    for (const section of page.sections) {
      const assetId = String(section.settings.imageAssetId ?? '');
      if (assetId) usage.set(assetId, [...(usage.get(assetId) ?? []), { type: 'section', label: `${page.title} / ${section.label}` }]);
    }
  }
  for (const product of products) {
    if (product.imageAssetId) usage.set(product.imageAssetId, [...(usage.get(product.imageAssetId) ?? []), { type: 'product', label: product.name }]);
  }
  return usage;
}

export const GET: APIRoute = async (context) => {
  const value = await requireStoreMembership(context);
  if (!value) return json({ error: 'Unauthorised' }, 401);
  const [assets, usage] = await Promise.all([listStoreAssets(value.store.id, context), assetUsage(value.store.id, context)]);
  return json({ assets: assets.map((asset) => publicAsset(asset, value.store.slug, usage.get(asset.id)?.length ?? 0)) });
};

export const POST: APIRoute = async (context) => {
  if (!sameOrigin(context.request)) return json({ error: 'Invalid request origin.' }, 403);
  const value = await requireStoreMembership(context);
  if (!value) return json({ error: 'Unauthorised' }, 401);
  try {
    const form = await context.request.formData();
    const file = form.get('asset');
    if (!(file instanceof File)) return json({ error: 'Choose an image to upload.' }, 400);
    const asset = await createStoreAsset(value.store.id, file, { name: String(form.get('name') ?? ''), alt: String(form.get('alt') ?? '') }, context);
    return json({ asset: publicAsset(asset, value.store.slug) }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Upload failed.' }, 400);
  }
};

export const PATCH: APIRoute = async (context) => {
  if (!sameOrigin(context.request)) return json({ error: 'Invalid request origin.' }, 403);
  const value = await requireStoreMembership(context);
  if (!value) return json({ error: 'Unauthorised' }, 401);
  try {
    const input = await context.request.json() as { assetId?: string; name?: string; alt?: string };
    const asset = await updateStoreAsset(value.store.id, String(input.assetId ?? ''), input, context);
    const usage = await assetUsage(value.store.id, context);
    return json({ asset: publicAsset(asset, value.store.slug, usage.get(asset.id)?.length ?? 0) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Update failed.' }, 400);
  }
};

export const DELETE: APIRoute = async (context) => {
  if (!sameOrigin(context.request)) return json({ error: 'Invalid request origin.' }, 403);
  const value = await requireStoreMembership(context);
  if (!value) return json({ error: 'Unauthorised' }, 401);
  try {
    const input = await context.request.json() as { assetId?: string };
    const assetId = String(input.assetId ?? '');
    const usage = await assetUsage(value.store.id, context);
    const references = usage.get(assetId) ?? [];
    if (references.length) return json({ error: 'This image is in use and cannot be deleted.', references }, 409);
    await deleteStoreAsset(value.store.id, assetId, context);
    return json({ deleted: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Delete failed.' }, 400);
  }
};
