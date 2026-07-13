import { readFileSync } from 'node:fs';

const templates = readFileSync('src/lib/storefront/templates.ts', 'utf8');
const themeStore = readFileSync('src/lib/storefront/themeStore.ts', 'utf8');
const editor = readFileSync('src/pages/admin/online-store/editor.astro', 'utf8');

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
  if (!editor.includes(marker)) throw new Error(`Editor missing ${marker}`);
}

console.log('Storefront builder audit passed.');
