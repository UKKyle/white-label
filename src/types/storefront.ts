export type TemplateKey = 'editorial' | 'commerce' | 'studio';
export type ThemeStatus = 'draft' | 'published' | 'archived';
export type RevisionStatus = 'draft' | 'published' | 'archived';
export type PageType = 'home' | 'collection' | 'product' | 'cart' | 'search' | 'content' | 'contact' | 'policy' | 'account' | 'not_found';
export type DeviceMode = 'desktop' | 'tablet' | 'mobile';

export type ThemeScalar = string | number | boolean;
export type ThemeSettings = Record<string, ThemeScalar>;

export interface StoreTheme {
  id: string;
  storeId: string;
  templateKey: TemplateKey;
  name: string;
  status: ThemeStatus;
  draftRevisionId?: string;
  publishedRevisionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ThemeRevision {
  id: string;
  storeId: string;
  themeId: string;
  version: number;
  createdByUserId: string;
  configuration: ThemeConfiguration;
  status: RevisionStatus;
  changeType: string;
  createdAt: string;
}

export interface ThemeConfiguration {
  schemaVersion: number;
  templateKey: TemplateKey;
  globalSettings: GlobalThemeSettings;
  pages: Record<string, PageConfiguration>;
  navigation: NavigationConfiguration;
}

export interface GlobalThemeSettings {
  storeNameDisplay: string;
  logoText: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  headingFont: string;
  bodyFont: string;
  buttonRadius: number;
  cardRadius: number;
  sectionSpacing: number;
  contentWidth: number;
  productCardStyle: 'minimal' | 'bordered' | 'elevated';
}

export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  visible: boolean;
  order: number;
}

export interface NavigationConfiguration {
  mainMenu: NavigationItem[];
  footerMenu: NavigationItem[];
}

export interface PageConfiguration {
  id: string;
  pageType: PageType;
  title: string;
  handle: string;
  status: 'draft' | 'published';
  sections: SectionInstance[];
  seo?: {
    title?: string;
    description?: string;
  };
}

export interface SectionInstance {
  id: string;
  type: string;
  label: string;
  visible: boolean;
  order: number;
  settings: ThemeSettings;
  blocks: BlockInstance[];
}

export interface BlockInstance {
  id: string;
  type: string;
  label: string;
  visible: boolean;
  order: number;
  settings: ThemeSettings;
}

export interface PreviewToken {
  token: string;
  storeId: string;
  themeId: string;
  revisionId: string;
  expiresAt: string;
  createdAt: string;
}

export interface StorefrontTemplateManifest {
  key: TemplateKey;
  name: string;
  description: string;
  businessTypes: string[];
  characteristics: string[];
  defaultPage: PageConfiguration;
  defaultSettings: GlobalThemeSettings;
}
