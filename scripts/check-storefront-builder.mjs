import { readFileSync } from 'node:fs';

const templates = readFileSync('src/lib/storefront/templates.ts', 'utf8');
const themeStore = readFileSync('src/lib/storefront/themeStore.ts', 'utf8');
const editor = readFileSync('src/pages/admin/online-store/editor.astro', 'utf8');
const renderer = readFileSync('src/components/storefront/StorefrontRenderer.astro', 'utf8');
const links = readFileSync('src/lib/storefront/links.ts', 'utf8');
const pageCreate = readFileSync('src/pages/admin/online-store/pages/new.astro', 'utf8');
const navigation = readFileSync('src/pages/admin/online-store/navigation.astro', 'utf8');

const requiredTemplates = ["key: 'editorial'", "key: 'commerce'", "key: 'studio'"];
for (const marker of requiredTemplates) {
  if (!templates.includes(marker)) throw new Error(`Missing template marker: ${marker}`);
}

const templateKeyMatches = templates.match(/key: '(editorial|commerce|studio)'/g) ?? [];
if (templateKeyMatches.length !== 3) throw new Error(`Expected exactly three template manifests, found ${templateKeyMatches.length}.`);

for (const marker of ['storeId', 'draftRevisionId', 'publishedRevisionId', 'validateThemeConfiguration', 'createPreviewToken', 'publishDraft', 'rollbackPublishedRevision']) {
  if (!themeStore.includes(marker)) throw new Error(`Theme store missing ${marker}`);
}

for (const marker of ['Page structure', 'canvas-device', 'Inspector', 'Create preview', 'Publish draft']) {
  const replacement = marker === 'Create preview' ? 'Preview draft' : marker === 'Publish draft' ? 'Publish changes' : marker;
  if (!editor.includes(marker) && !editor.includes(replacement)) throw new Error(`Editor missing ${marker}`);
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

console.log('Storefront builder audit passed.');
