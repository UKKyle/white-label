import { readFileSync } from 'node:fs';

const templates = readFileSync('src/lib/storefront/templates.ts', 'utf8');
const themeStore = readFileSync('src/lib/storefront/themeStore.ts', 'utf8');
const editor = readFileSync('src/pages/admin/online-store/editor.astro', 'utf8');
const renderer = readFileSync('src/components/storefront/StorefrontRenderer.astro', 'utf8');
const links = readFileSync('src/lib/storefront/links.ts', 'utf8');
const pageCreate = readFileSync('src/pages/admin/online-store/pages/new.astro', 'utf8');
const navigation = readFileSync('src/pages/admin/online-store/navigation.astro', 'utf8');
const catalogue = readFileSync('src/lib/storefront/catalogStore.ts', 'utf8');
const assets = readFileSync('src/lib/storefront/assetStore.ts', 'utf8');
const assetRoute = readFileSync('src/pages/store-assets/[slug]/[assetId].ts', 'utf8');
const assetApi = readFileSync('src/pages/admin/api/storefront/assets.ts', 'utf8');
const reusableSections = readFileSync('src/lib/storefront/reusableSectionStore.ts', 'utf8');

const requiredTemplates = ["key: 'editorial'", "key: 'commerce'", "key: 'studio'"];
for (const marker of requiredTemplates) {
  if (!templates.includes(marker)) throw new Error(`Missing template marker: ${marker}`);
}

const templateKeyMatches = templates.match(/key: '(editorial|commerce|studio)'/g) ?? [];
if (templateKeyMatches.length !== 3) throw new Error(`Expected exactly three template manifests, found ${templateKeyMatches.length}.`);

for (const marker of ['storeId', 'draftRevisionId', 'publishedRevisionId', 'validateThemeConfiguration', 'createPreviewToken', 'publishDraft', 'rollbackPublishedRevision', 'duplicatePage', 'deletePage', 'missingAssets', 'missingProducts']) {
  if (!themeStore.includes(marker)) throw new Error(`Theme store missing ${marker}`);
}

for (const marker of ['Page structure', 'canvas-device', 'Inspector', 'Create preview', 'Publish draft']) {
  const replacement = marker === 'Create preview' ? 'Preview draft' : marker === 'Publish draft' ? 'Publish changes' : marker;
  if (!editor.includes(marker) && !editor.includes(replacement)) throw new Error(`Editor missing ${marker}`);
}
for (const marker of ['undoDraft', 'redoDraft', 'pasteSection', 'data-copy-section', 'upload-asset', 'productIds', 'data-inspector-form']) {
  if (!editor.includes(marker)) throw new Error(`Editor interaction workflow missing ${marker}`);
}
for (const marker of ['visual-editor-shell', 'editor-tool-rail', 'data-layer-list', 'data-canvas-image-input', 'data-resize-handle', 'data-spacing-handle', 'contentEditable', 'reorder-section', 'save-reusable', 'nonce={Astro.locals.cspNonce}']) {
  if (!editor.includes(marker)) throw new Error(`Visual editor workflow missing ${marker}`);
}
for (const marker of ['requireStoreMembership', 'sameOrigin', 'usageCount', 'deleteStoreAsset', 'updateStoreAsset']) {
  if (!assetApi.includes(marker)) throw new Error(`Asset management API missing ${marker}`);
}
for (const marker of ['storeId', 'item.storeId === storeId', 'saveReusableSection', 'deleteReusableSection']) {
  if (!reusableSections.includes(marker)) throw new Error(`Reusable section store missing ${marker}`);
}

for (const marker of ['resolveStorefrontHref', 'encodeURIComponent(store.slug)', 'homeHref']) {
  if (!renderer.includes(marker)) throw new Error(`Storefront renderer missing tenant link marker: ${marker}`);
}
for (const marker of ['normaliseStorefrontPath', 'resolveStorefrontHref', 'resolvePageId']) {
  if (!links.includes(marker)) throw new Error(`Tenant route resolver missing ${marker}`);
}
if (templates.includes('/store/demo')) throw new Error('Template defaults contain a hard-coded demo tenant route.');
if (!pageCreate.includes('createPage') || pageCreate.includes('disabled placeholder')) throw new Error('Page creation workflow is not active.');
if (navigation.includes('name={`mainHref${index}`} value=')) throw new Error('Navigation still exposes an uncontrolled raw internal path field.');
for (const [source, label] of [[catalogue, 'catalogue'], [assets, 'asset library']]) {
  for (const marker of ['storeId', 'key(storeId', '.storeId === storeId']) {
    if (!source.includes(marker)) throw new Error(`Tenant-scoped ${label} missing ${marker}`);
  }
}
if (!renderer.includes('listCatalogProducts(store.id') || renderer.includes('Preview product')) throw new Error('Storefront product sections are not backed by the tenant catalogue.');
if (!assetRoute.includes('getStoreBySlug') || !assetRoute.includes('getStoreAsset(store.id')) throw new Error('Asset delivery route is not bound to the resolved tenant.');

console.log('Storefront builder audit passed.');
