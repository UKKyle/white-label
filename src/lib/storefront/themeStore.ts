import { getAdapterEnv, type RuntimeContext } from '../runtimeEnv';
import { appendAudit } from '../platform/store';
import type { PlatformRole } from '../../types/platform';
import type { BlockInstance, PageConfiguration, PreviewToken, SectionInstance, StoreTheme, TemplateKey, ThemeConfiguration, ThemeRevision } from '../../types/storefront';
import { createDefaultConfiguration, getTemplate, sectionLibrary, templates } from './templates';
import { listStoreAssets } from './assetStore';
import { listCatalogProducts } from './catalogStore';

type Kv = { get(key: string, type?: 'json'): Promise<unknown>; put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>; delete(key: string): Promise<void> };
type EditorHistoryState = { undo: string[]; redo: string[] };
const memory = new Map<string, string>();
const PREFIX = 'wl:v1:storefront:';

function now() { return new Date().toISOString(); }
function id(prefix: string) { return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`; }
function key(...parts: string[]) { return PREFIX + parts.join(':'); }

async function binding(context?: RuntimeContext): Promise<Kv | null> {
  const candidate = getAdapterEnv(context).SESSION as Kv | undefined;
  return candidate && typeof candidate.get === 'function' && typeof candidate.put === 'function' ? candidate : null;
}

async function read<T>(name: string, context?: RuntimeContext): Promise<T | null> {
  const kv = await binding(context);
  const value = kv ? await kv.get(name) : memory.get(name);
  if (!value) return null;
  try { return typeof value === 'string' ? JSON.parse(value) as T : value as T; } catch { return null; }
}

async function write<T>(name: string, value: T, context?: RuntimeContext, ttl?: number) {
  const body = JSON.stringify(value);
  const kv = await binding(context);
  if (kv) await kv.put(name, body, ttl ? { expirationTtl: ttl } : undefined);
  else memory.set(name, body);
}

function cleanText(value: unknown, fallback = '') {
  return String(value ?? fallback).replace(/[<>]/g, '').trim().slice(0, 280);
}

function cleanUrl(value: unknown, fallback = '#') {
  const candidate = String(value ?? fallback).trim();
  if (/^(javascript|data|vbscript):/i.test(candidate)) return fallback;
  if (candidate.startsWith('/') || candidate.startsWith('https://') || candidate.startsWith('mailto:') || candidate.startsWith('tel:')) return candidate.slice(0, 500);
  return fallback;
}

function cleanColour(value: unknown, fallback = '') {
  const candidate = String(value ?? '').trim();
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback;
}

function cleanSetting(settingKey: string, value: unknown): string | number | boolean {
  if (/href|url|link/i.test(settingKey)) return cleanUrl(value);
  if (/color$/i.test(settingKey)) return cleanColour(value);
  if (['alignment', 'alignmentTablet', 'alignmentMobile'].includes(settingKey)) return value === 'center' ? 'center' : 'left';
  if (settingKey === 'imagePosition') return value === 'left' ? 'left' : 'right';
  if (settingKey === 'imageFit') return value === 'contain' ? 'contain' : 'cover';
  if (settingKey === 'imageAspect') return ['auto', '1 / 1', '4 / 3', '16 / 9'].includes(String(value)) ? String(value) : 'auto';
  if (settingKey === 'focalPoint') return ['center', 'top', 'bottom', 'left', 'right'].includes(String(value)) ? String(value) : 'center';
  if (settingKey === 'headingSize') return ['small', 'default', 'large'].includes(String(value)) ? String(value) : 'default';
  if (settingKey === 'imageAssetId') return /^[a-z0-9_-]{1,80}$/i.test(String(value ?? '')) ? String(value) : '';
  if (settingKey === 'productIds') return String(value ?? '').split(',').map((item) => item.trim()).filter((item) => /^[a-z0-9_-]{1,80}$/i.test(item)).slice(0, 24).join(',');
  if (['paddingTop', 'paddingBottom', 'paddingTopTablet', 'paddingBottomTablet', 'paddingTopMobile', 'paddingBottomMobile'].includes(settingKey)) return Math.min(160, Math.max(0, Number(value) || 0));
  if (settingKey === 'paddingHorizontal') return Math.min(80, Math.max(0, Number(value) || 0));
  if (['columnsDesktop', 'columnsTablet', 'columnsMobile'].includes(settingKey)) return Math.min(6, Math.max(1, Number(value) || (settingKey === 'columnsMobile' ? 1 : 3)));
  if (settingKey === 'gridGap') return Math.min(64, Math.max(0, Number(value) || 0));
  if (settingKey === 'imageZoom') return Math.min(200, Math.max(50, Number(value) || 100));
  if (settingKey === 'imageRadius') return Math.min(80, Math.max(0, Number(value) || 0));
  if (settingKey === 'mediaWidth') return Math.min(75, Math.max(25, Number(value) || 45));
  if (settingKey === 'productCount') return Math.min(24, Math.max(1, Number(value) || 4));
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  return cleanText(value);
}

function validateSection(section: SectionInstance): SectionInstance {
  if (!sectionLibrary.includes(section.type as any)) throw new Error(`Unsupported section type: ${section.type}`);
  return {
    ...section,
    id: section.id || id('section'),
    label: cleanText(section.label, section.type),
    visible: section.visible !== false,
    order: Number.isFinite(section.order) ? Number(section.order) : 0,
    settings: Object.fromEntries(Object.entries(section.settings ?? {}).slice(0, 40).map(([settingKey, value]) => [settingKey, cleanSetting(settingKey, value)])),
    blocks: (section.blocks ?? []).slice(0, 12).map(validateBlock).sort((a, b) => a.order - b.order),
  };
}

function validateBlock(block: BlockInstance): BlockInstance {
  return {
    ...block,
    id: block.id || id('block'),
    label: cleanText(block.label, block.type),
    visible: block.visible !== false,
    order: Number.isFinite(block.order) ? Number(block.order) : 0,
    settings: Object.fromEntries(Object.entries(block.settings ?? {}).slice(0, 30).map(([settingKey, value]) => [settingKey, cleanSetting(settingKey, value)])),
  };
}

export function validateThemeConfiguration(configuration: ThemeConfiguration): ThemeConfiguration {
  if (configuration.schemaVersion !== 1) throw new Error('Unsupported theme schema version.');
  if (!getTemplate(configuration.templateKey)) throw new Error('Unknown template.');
  const pages = Object.fromEntries(Object.entries(configuration.pages ?? {}).map(([pageKey, page]) => {
    const safePage: PageConfiguration = {
      ...page,
      id: cleanText(page.id, pageKey),
      title: cleanText(page.title, pageKey),
      handle: page.handle.startsWith('/') ? cleanUrl(page.handle, '/') : '/',
      status: page.status === 'published' ? 'published' : 'draft',
      sections: (page.sections ?? []).slice(0, 80).map(validateSection).sort((a, b) => a.order - b.order),
    };
    return [pageKey, safePage];
  }));
  if (!pages.home) throw new Error('Homepage configuration is required.');
  return {
    ...configuration,
    globalSettings: {
      ...configuration.globalSettings,
      storeNameDisplay: cleanText(configuration.globalSettings.storeNameDisplay, 'Your Store'),
      logoText: cleanText(configuration.globalSettings.logoText, 'YS').slice(0, 4),
      primaryColor: cleanColour(configuration.globalSettings.primaryColor, '#17202a'),
      secondaryColor: cleanColour(configuration.globalSettings.secondaryColor, '#eef1f5'),
      accentColor: cleanColour(configuration.globalSettings.accentColor, '#3863d9'),
      backgroundColor: cleanColour(configuration.globalSettings.backgroundColor, '#ffffff'),
      surfaceColor: cleanColour(configuration.globalSettings.surfaceColor, '#ffffff'),
      textColor: cleanColour(configuration.globalSettings.textColor, '#17202a'),
      mutedTextColor: cleanColour(configuration.globalSettings.mutedTextColor, '#66717f'),
      borderColor: cleanColour(configuration.globalSettings.borderColor, '#e3e7ed'),
      headingFont: ['Inter', 'Georgia', 'Arial', 'Verdana'].includes(configuration.globalSettings.headingFont) ? configuration.globalSettings.headingFont : 'Inter',
      bodyFont: ['Inter', 'Georgia', 'Arial', 'Verdana'].includes(configuration.globalSettings.bodyFont) ? configuration.globalSettings.bodyFont : 'Inter',
      buttonRadius: Math.min(40, Math.max(0, Number(configuration.globalSettings.buttonRadius) || 8)),
      cardRadius: Math.min(40, Math.max(0, Number(configuration.globalSettings.cardRadius) || 8)),
      sectionSpacing: Math.min(160, Math.max(16, Number(configuration.globalSettings.sectionSpacing) || 72)),
      contentWidth: Math.min(1600, Math.max(640, Number(configuration.globalSettings.contentWidth) || 1180)),
      productCardStyle: ['minimal', 'bordered', 'elevated'].includes(configuration.globalSettings.productCardStyle) ? configuration.globalSettings.productCardStyle : 'minimal',
    },
    pages,
    navigation: {
      mainMenu: (configuration.navigation?.mainMenu ?? []).slice(0, 12).map((item, order) => ({ ...item, label: cleanText(item.label, 'Link'), href: cleanUrl(item.href, '/'), visible: item.visible !== false, order })),
      footerMenu: (configuration.navigation?.footerMenu ?? []).slice(0, 12).map((item, order) => ({ ...item, label: cleanText(item.label, 'Link'), href: cleanUrl(item.href, '/'), visible: item.visible !== false, order })),
    },
  };
}

async function nextVersion(storeId: string, context?: RuntimeContext) {
  const ids = await read<string[]>(key(storeId, 'revisions'), context) ?? [];
  const revisions = await Promise.all(ids.map((revisionId) => getThemeRevision(storeId, revisionId, context)));
  return Math.max(0, ...revisions.filter(Boolean).map((revision) => revision!.version)) + 1;
}

export function listStorefrontTemplates() { return templates; }
export async function getStoreTheme(storeId: string, context?: RuntimeContext) { return read<StoreTheme>(key(storeId, 'theme'), context); }
export async function getThemeRevision(storeId: string, revisionId: string, context?: RuntimeContext) { return read<ThemeRevision>(key(storeId, 'revision', revisionId), context); }
export async function listThemeRevisions(storeId: string, context?: RuntimeContext) {
  const ids = await read<string[]>(key(storeId, 'revisions'), context) ?? [];
  return (await Promise.all(ids.map((revisionId) => getThemeRevision(storeId, revisionId, context)))).filter((revision): revision is ThemeRevision => Boolean(revision));
}

async function writeRevision(revision: ThemeRevision, context?: RuntimeContext) {
  const index = await read<string[]>(key(revision.storeId, 'revisions'), context) ?? [];
  await Promise.all([
    write(key(revision.storeId, 'revision', revision.id), revision, context),
    write(key(revision.storeId, 'revisions'), [revision.id, ...index.filter((id) => id !== revision.id)].slice(0, 30), context),
  ]);
}

export async function selectTemplateForStore(input: { storeId: string; userId: string; role: PlatformRole; templateKey: TemplateKey }, context?: RuntimeContext) {
  const template = getTemplate(input.templateKey);
  if (!template) throw new Error('Unknown template.');
  const existing = await getStoreTheme(input.storeId, context);
  const theme: StoreTheme = {
    id: existing?.id ?? id('theme'),
    storeId: input.storeId,
    templateKey: input.templateKey,
    name: template.name,
    status: 'draft',
    publishedRevisionId: existing?.publishedRevisionId,
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
  };
  const nextConfiguration = createDefaultConfiguration(input.templateKey);
  const existingDraft = existing ? await getDraftRevision(input.storeId, context) : null;
  if (existingDraft) {
    nextConfiguration.globalSettings = { ...nextConfiguration.globalSettings, ...existingDraft.configuration.globalSettings };
    nextConfiguration.navigation = JSON.parse(JSON.stringify(existingDraft.configuration.navigation));
    for (const [pageId, page] of Object.entries(existingDraft.configuration.pages)) {
      if (!nextConfiguration.pages[pageId] && !['home', 'collection', 'product', 'cart', 'not_found'].includes(pageId)) {
        nextConfiguration.pages[pageId] = JSON.parse(JSON.stringify(page));
      }
    }
  }
  const configuration = validateThemeConfiguration(nextConfiguration);
  const revision: ThemeRevision = { id: id('rev'), storeId: input.storeId, themeId: theme.id, version: await nextVersion(input.storeId, context), createdByUserId: input.userId, configuration, status: 'draft', changeType: existing ? 'template.switch' : 'template.select', createdAt: now() };
  theme.draftRevisionId = revision.id;
  await writeRevision(revision, context);
  await Promise.all([
    write(key(input.storeId, 'theme'), theme, context),
    write(key(input.storeId, 'editor-history'), { undo: [], redo: [] } satisfies EditorHistoryState, context),
  ]);
  await appendAudit({ actorUserId: input.userId, actorRole: input.role, storeId: input.storeId, action: revision.changeType, targetType: 'theme', targetId: theme.id, metadata: { template: input.templateKey, revisionId: revision.id } }, context);
  return { theme, revision };
}

export async function getDraftRevision(storeId: string, context?: RuntimeContext) {
  const theme = await getStoreTheme(storeId, context);
  return theme?.draftRevisionId ? getThemeRevision(storeId, theme.draftRevisionId, context) : null;
}

export async function getPublishedRevision(storeId: string, context?: RuntimeContext) {
  const theme = await getStoreTheme(storeId, context);
  return theme?.publishedRevisionId ? getThemeRevision(storeId, theme.publishedRevisionId, context) : null;
}

export async function saveDraft(input: { storeId: string; userId: string; role: PlatformRole; configuration: ThemeConfiguration; baseVersion?: number; changeType: string }, context?: RuntimeContext) {
  const theme = await getStoreTheme(input.storeId, context);
  if (!theme) throw new Error('Select a template before saving.');
  const currentDraft = await getDraftRevision(input.storeId, context);
  if (input.baseVersion && currentDraft && currentDraft.version !== input.baseVersion) throw new Error('Draft revision conflict.');
  const configuration = validateThemeConfiguration(input.configuration);
  const revision: ThemeRevision = { id: id('rev'), storeId: input.storeId, themeId: theme.id, version: await nextVersion(input.storeId, context), createdByUserId: input.userId, configuration, status: 'draft', changeType: input.changeType, createdAt: now() };
  theme.draftRevisionId = revision.id;
  theme.updatedAt = now();
  const history = await read<EditorHistoryState>(key(input.storeId, 'editor-history'), context) ?? { undo: [], redo: [] };
  await writeRevision(revision, context);
  await Promise.all([
    write(key(input.storeId, 'theme'), theme, context),
    write(key(input.storeId, 'editor-history'), { undo: currentDraft ? [currentDraft.id, ...history.undo.filter((revisionId) => revisionId !== currentDraft.id)].slice(0, 30) : history.undo, redo: [] }, context),
  ]);
  await appendAudit({ actorUserId: input.userId, actorRole: input.role, storeId: input.storeId, action: 'theme.draft_saved', targetType: 'themeRevision', targetId: revision.id, metadata: { version: String(revision.version), changeType: input.changeType } }, context);
  return revision;
}

export async function getEditorHistoryState(storeId: string, context?: RuntimeContext) {
  const state = await read<EditorHistoryState>(key(storeId, 'editor-history'), context) ?? { undo: [], redo: [] };
  return { canUndo: state.undo.length > 0, canRedo: state.redo.length > 0 };
}

async function restoreEditorHistory(input: { storeId: string; userId: string; role: PlatformRole; direction: 'undo' | 'redo' }, context?: RuntimeContext) {
  const theme = await getStoreTheme(input.storeId, context);
  const current = await getDraftRevision(input.storeId, context);
  if (!theme || !current) throw new Error('No draft history is available.');
  let state = await read<EditorHistoryState>(key(input.storeId, 'editor-history'), context) ?? { undo: [], redo: [] };
  if (!state.undo.length && input.direction === 'undo') {
    const revisions = await listThemeRevisions(input.storeId, context);
    state.undo = revisions.filter((revision) => revision.id !== current.id && revision.status === 'draft').map((revision) => revision.id).slice(0, 30);
  }
  const source = input.direction === 'undo' ? state.undo : state.redo;
  const targetId = source[0];
  const target = targetId ? await getThemeRevision(input.storeId, targetId, context) : null;
  if (!target || target.storeId !== input.storeId) throw new Error(`Nothing to ${input.direction}.`);
  const revision: ThemeRevision = { id: id('rev'), storeId: input.storeId, themeId: theme.id, version: await nextVersion(input.storeId, context), createdByUserId: input.userId, configuration: validateThemeConfiguration(JSON.parse(JSON.stringify(target.configuration))), status: 'draft', changeType: `history.${input.direction}`, createdAt: now() };
  theme.draftRevisionId = revision.id;
  theme.updatedAt = now();
  const nextState: EditorHistoryState = input.direction === 'undo'
    ? { undo: state.undo.slice(1), redo: [current.id, ...state.redo].slice(0, 30) }
    : { undo: [current.id, ...state.undo].slice(0, 30), redo: state.redo.slice(1) };
  await writeRevision(revision, context);
  await Promise.all([write(key(input.storeId, 'theme'), theme, context), write(key(input.storeId, 'editor-history'), nextState, context)]);
  await appendAudit({ actorUserId: input.userId, actorRole: input.role, storeId: input.storeId, action: `theme.${input.direction}`, targetType: 'themeRevision', targetId: revision.id, metadata: { restoredRevisionId: target.id } }, context);
  return revision;
}

export async function undoDraft(input: { storeId: string; userId: string; role: PlatformRole }, context?: RuntimeContext) {
  return restoreEditorHistory({ ...input, direction: 'undo' }, context);
}

export async function redoDraft(input: { storeId: string; userId: string; role: PlatformRole }, context?: RuntimeContext) {
  return restoreEditorHistory({ ...input, direction: 'redo' }, context);
}

export async function publishDraft(input: { storeId: string; userId: string; role: PlatformRole }, context?: RuntimeContext) {
  const theme = await getStoreTheme(input.storeId, context);
  const draft = await getDraftRevision(input.storeId, context);
  if (!theme || !draft) throw new Error('No draft theme to publish.');
  const configuration = validateThemeConfiguration(draft.configuration);
  const handles = new Set(Object.values(configuration.pages).map((page) => page.handle));
  const allowedSystemPaths = new Set(['/account', '/search', '/cart', '/collections/all']);
  const brokenLinks = [...configuration.navigation.mainMenu, ...configuration.navigation.footerMenu]
    .filter((item) => item.visible && item.href.startsWith('/') && !handles.has(item.href) && !allowedSystemPaths.has(item.href));
  if (brokenLinks.length) throw new Error(`Fix ${brokenLinks.length} broken navigation link${brokenLinks.length === 1 ? '' : 's'} before publishing.`);
  if (!configuration.pages.home.sections.some((section) => section.visible)) throw new Error('The homepage must contain at least one visible section.');
  const [assets, products] = await Promise.all([listStoreAssets(input.storeId, context), listCatalogProducts(input.storeId, context)]);
  const assetIds = new Set(assets.map((asset) => asset.id));
  const activeProductIds = new Set(products.filter((product) => product.status === 'active').map((product) => product.id));
  const allSections = Object.values(configuration.pages).flatMap((page) => page.sections);
  const missingAssets = allSections.filter((section) => section.settings.imageAssetId && !assetIds.has(String(section.settings.imageAssetId)));
  const missingProducts = allSections.flatMap((section) => String(section.settings.productIds ?? '').split(',').filter(Boolean)).filter((productId) => !activeProductIds.has(productId));
  if (missingAssets.length) throw new Error(`Replace ${missingAssets.length} missing image reference${missingAssets.length === 1 ? '' : 's'} before publishing.`);
  if (missingProducts.length) throw new Error(`Replace ${missingProducts.length} unavailable product reference${missingProducts.length === 1 ? '' : 's'} before publishing.`);
  const revision: ThemeRevision = { ...draft, id: id('rev'), version: await nextVersion(input.storeId, context), configuration, status: 'published', changeType: 'publish', createdAt: now(), createdByUserId: input.userId };
  theme.publishedRevisionId = revision.id;
  theme.status = 'published';
  theme.updatedAt = now();
  await writeRevision(revision, context);
  await write(key(input.storeId, 'theme'), theme, context);
  await appendAudit({ actorUserId: input.userId, actorRole: input.role, storeId: input.storeId, action: 'theme.published', targetType: 'themeRevision', targetId: revision.id, metadata: { version: String(revision.version), template: theme.templateKey } }, context);
  return revision;
}

export async function rollbackPublishedRevision(input: { storeId: string; userId: string; role: PlatformRole; revisionId: string }, context?: RuntimeContext) {
  const theme = await getStoreTheme(input.storeId, context);
  const revision = await getThemeRevision(input.storeId, input.revisionId, context);
  if (!theme || !revision || revision.status !== 'published') throw new Error('Published revision not found.');
  theme.publishedRevisionId = revision.id;
  theme.draftRevisionId = revision.id;
  theme.updatedAt = now();
  await write(key(input.storeId, 'theme'), theme, context);
  await appendAudit({ actorUserId: input.userId, actorRole: input.role, storeId: input.storeId, action: 'theme.rolled_back', targetType: 'themeRevision', targetId: revision.id, metadata: { version: String(revision.version) } }, context);
  return revision;
}

export async function createPreviewToken(input: { storeId: string; userId: string; role: PlatformRole }, context?: RuntimeContext) {
  const theme = await getStoreTheme(input.storeId, context);
  const draft = await getDraftRevision(input.storeId, context);
  if (!theme || !draft) throw new Error('No draft available to preview.');
  const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const preview: PreviewToken = { token, storeId: input.storeId, themeId: theme.id, revisionId: draft.id, createdAt: now(), expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
  await write(key('preview', token), preview, context, 60 * 60);
  await appendAudit({ actorUserId: input.userId, actorRole: input.role, storeId: input.storeId, action: 'theme.preview_created', targetType: 'themeRevision', targetId: draft.id, metadata: { expiresAt: preview.expiresAt } }, context);
  return preview;
}

export async function getPreviewToken(token: string, context?: RuntimeContext) {
  const preview = await read<PreviewToken>(key('preview', token), context);
  if (!preview || new Date(preview.expiresAt).getTime() < Date.now()) return null;
  return preview;
}

export function duplicateSection(configuration: ThemeConfiguration, pageId: string, sectionId: string) {
  const page = configuration.pages[pageId];
  const section = page?.sections.find((item) => item.id === sectionId);
  if (!page || !section) return configuration;
  const clone = JSON.parse(JSON.stringify(section)) as SectionInstance;
  clone.id = id('section');
  clone.label = `${section.label} copy`;
  clone.settings.locked = false;
  clone.blocks = clone.blocks.map((block, order) => ({ ...block, id: id('block'), order }));
  const sourceIndex = page.sections.findIndex((item) => item.id === sectionId);
  page.sections.splice(sourceIndex + 1, 0, clone);
  page.sections = page.sections.map((item, order) => ({ ...item, order }));
  return validateThemeConfiguration(configuration);
}

export function addSection(configuration: ThemeConfiguration, pageId: string, type: string, afterSectionId?: string) {
  if (!sectionLibrary.includes(type as any)) throw new Error('Unsupported section type.');
  const page = configuration.pages[pageId];
  if (!page) throw new Error('Page not found.');
  const section: SectionInstance = { id: id('section'), type, label: type.replaceAll('_', ' '), visible: true, order: page.sections.length, settings: { heading: type.replaceAll('_', ' ') }, blocks: [] };
  const index = afterSectionId ? page.sections.findIndex((item) => item.id === afterSectionId) : -1;
  page.sections.splice(index >= 0 ? index + 1 : page.sections.length, 0, section);
  page.sections = page.sections.map((item, order) => ({ ...item, order }));
  return validateThemeConfiguration(configuration);
}

export function moveSection(configuration: ThemeConfiguration, pageId: string, sectionId: string, direction: 'up' | 'down') {
  const page = configuration.pages[pageId];
  if (!page) return configuration;
  const index = page.sections.findIndex((item) => item.id === sectionId);
  if (index >= 0 && page.sections[index].settings.locked === true) throw new Error('Unlock this section before moving it.');
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= page.sections.length) return configuration;
  const [item] = page.sections.splice(index, 1);
  page.sections.splice(target, 0, item);
  page.sections = page.sections.map((section, order) => ({ ...section, order }));
  return validateThemeConfiguration(configuration);
}

export function removeSection(configuration: ThemeConfiguration, pageId: string, sectionId: string) {
  const page = configuration.pages[pageId];
  if (!page) return configuration;
  const section = page.sections.find((item) => item.id === sectionId);
  if (!section || ['header', 'footer'].includes(section.type)) throw new Error('This required section cannot be removed.');
  if (section.settings.locked === true) throw new Error('Unlock this section before removing it.');
  page.sections = page.sections.filter((item) => item.id !== sectionId).map((item, order) => ({ ...item, order }));
  return validateThemeConfiguration(configuration);
}

export function reorderSection(configuration: ThemeConfiguration, pageId: string, sectionId: string, targetIndex: number) {
  const page = configuration.pages[pageId];
  if (!page) throw new Error('Page not found.');
  const sourceIndex = page.sections.findIndex((item) => item.id === sectionId);
  if (sourceIndex < 0) throw new Error('Section not found.');
  if (page.sections[sourceIndex].settings.locked === true) throw new Error('Unlock this section before moving it.');
  const boundedTarget = Math.min(page.sections.length - 1, Math.max(0, Math.round(targetIndex)));
  const [section] = page.sections.splice(sourceIndex, 1);
  page.sections.splice(boundedTarget, 0, section);
  page.sections = page.sections.map((item, order) => ({ ...item, order }));
  return validateThemeConfiguration(configuration);
}

export function pasteSection(configuration: ThemeConfiguration, pageId: string, rawSection: string, afterSectionId?: string) {
  const page = configuration.pages[pageId];
  if (!page) throw new Error('Page not found.');
  let section: SectionInstance;
  try { section = JSON.parse(rawSection) as SectionInstance; } catch { throw new Error('The copied section is invalid.'); }
  section.id = id('section');
  section.label = `${cleanText(section.label, section.type)} copy`;
  section.blocks = (section.blocks ?? []).map((block, order) => ({ ...block, id: id('block'), order }));
  const selectedIndex = afterSectionId ? page.sections.findIndex((item) => item.id === afterSectionId) : -1;
  page.sections.splice(selectedIndex >= 0 ? selectedIndex + 1 : page.sections.length, 0, section);
  page.sections = page.sections.map((item, order) => ({ ...item, order }));
  return validateThemeConfiguration(configuration);
}

export function createPage(configuration: ThemeConfiguration, input: { title: string; handle: string }) {
  const title = cleanText(input.title);
  const slug = input.handle.trim().toLowerCase().replace(/^\/+/, '').replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, '');
  if (!title || !slug) throw new Error('Enter a page title and valid URL handle.');
  const pageId = `page_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const page: PageConfiguration = {
    id: pageId,
    pageType: 'content',
    title,
    handle: `/pages/${slug}`,
    status: 'draft',
    sections: [{ id: id('section'), type: 'rich_text', label: 'Page content', visible: true, order: 0, settings: { heading: title, body: '' }, blocks: [] }],
    seo: { title, description: '' },
  };
  configuration.pages[pageId] = page;
  return { configuration: validateThemeConfiguration(configuration), pageId };
}

export function duplicatePage(configuration: ThemeConfiguration, pageId: string) {
  const source = configuration.pages[pageId];
  if (!source) throw new Error('Page not found.');
  const nextPageId = `page_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const baseHandle = source.handle.replace(/^\/pages\//, '').replace(/^\/+/, '') || 'page';
  let suffix = 1;
  let handle = `/pages/${baseHandle}-copy`;
  const handles = new Set(Object.values(configuration.pages).map((page) => page.handle));
  while (handles.has(handle)) handle = `/pages/${baseHandle}-copy-${++suffix}`;
  const page = JSON.parse(JSON.stringify(source)) as PageConfiguration;
  page.id = nextPageId;
  page.pageType = 'content';
  page.title = `${source.title} copy`;
  page.handle = handle;
  page.status = 'draft';
  page.sections = page.sections.map((section, order) => ({ ...section, id: id('section'), order, blocks: section.blocks.map((block, blockOrder) => ({ ...block, id: id('block'), order: blockOrder })) }));
  configuration.pages[nextPageId] = page;
  return { configuration: validateThemeConfiguration(configuration), pageId: nextPageId };
}

export function deletePage(configuration: ThemeConfiguration, pageId: string) {
  const page = configuration.pages[pageId];
  if (!page) throw new Error('Page not found.');
  if (['home', 'product', 'collection', 'cart', 'search', 'account', 'not_found'].includes(pageId)) throw new Error('Required system pages cannot be deleted.');
  delete configuration.pages[pageId];
  configuration.navigation.mainMenu = configuration.navigation.mainMenu.filter((item) => item.href !== page.handle).map((item, order) => ({ ...item, order }));
  configuration.navigation.footerMenu = configuration.navigation.footerMenu.filter((item) => item.href !== page.handle).map((item, order) => ({ ...item, order }));
  return validateThemeConfiguration(configuration);
}

export function updatePage(configuration: ThemeConfiguration, pageId: string, input: { title: string; handle: string; status: string; seoTitle: string; seoDescription: string }) {
  const page = configuration.pages[pageId];
  if (!page) throw new Error('Page not found.');
  page.title = cleanText(input.title, page.title);
  if (!['home', 'product', 'collection', 'cart', 'not_found'].includes(page.id)) {
    const slug = input.handle.trim().toLowerCase().replace(/^\/?(pages\/)?/, '').replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, '');
    if (slug) page.handle = `/pages/${slug}`;
  }
  page.status = input.status === 'published' ? 'published' : 'draft';
  page.seo = { title: cleanText(input.seoTitle), description: cleanText(input.seoDescription) };
  return validateThemeConfiguration(configuration);
}
