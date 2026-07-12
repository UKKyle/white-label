export interface BusinessConfig {
  name: string;
  legalName?: string;
  domain: string;
  siteUrl: string;
  supportEmail: string;
  orderEmail?: string;
  phone?: string;
  currency: string;
  locale: string;
  timezone: string;
  branding: {
    logoPath: string;
    faviconPath: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    backgroundColor: string;
    textColor: string;
  };
  social: {
    instagram?: string;
    facebook?: string;
    tiktok?: string;
    whatsapp?: string;
  };
  commerce: {
    loyaltyEnabled: boolean;
    loyaltyRate: number;
    deliveryEnabled: boolean;
    collectionEnabled: boolean;
    orderReferencePrefix: string;
  };
  seo: {
    defaultTitle: string;
    titleTemplate: string;
    defaultDescription: string;
    defaultOgImage?: string;
  };
  theme: {
    surfaceColor: string;
    mutedTextColor: string;
    borderColor: string;
    focusColor: string;
    headingFont: string;
    bodyFont: string;
    cardRadius: string;
    inputRadius: string;
    buttonRadius: string;
    contentWidth: string;
    sectionSpacing: string;
    componentSpacing: string;
  };
  content: {
    strapline: string;
    footerBlurb: string;
  };
}

export const businessConfig: BusinessConfig = {
  name: 'Your Store',
  legalName: 'Your Store Ltd',
  domain: 'example.com',
  siteUrl: 'https://example.com',
  supportEmail: 'hello@example.com',
  orderEmail: 'orders@example.com',
  phone: '+44 0000 000000',
  currency: 'GBP',
  locale: 'en-GB',
  timezone: 'Europe/London',
  branding: {
    logoPath: '/brand/placeholder-logo.svg',
    faviconPath: '/brand/placeholder-favicon.svg',
    primaryColor: '#b84f6a',
    secondaryColor: '#2f7a78',
    accentColor: '#e4a85d',
    backgroundColor: '#fffdf9',
    textColor: '#2b2432',
  },
  social: {
    instagram: 'https://instagram.com/example',
    facebook: 'https://facebook.com/example',
    tiktok: 'https://tiktok.com/@example',
    whatsapp: 'https://wa.me/440000000000',
  },
  commerce: {
    loyaltyEnabled: true,
    loyaltyRate: 0.05,
    deliveryEnabled: true,
    collectionEnabled: true,
    orderReferencePrefix: 'wlc',
  },
  seo: {
    defaultTitle: 'Your Store',
    titleTemplate: '%s | Your Store',
    defaultDescription: 'Reusable white-label ecommerce foundation with neutral branding, safe defaults, and deployment isolation.',
    defaultOgImage: '/brand/placeholder-logo.svg',
  },
  theme: {
    surfaceColor: '#fff8f1',
    mutedTextColor: '#6f6676',
    borderColor: '#ead8cf',
    focusColor: '#b84f6a',
    headingFont: '"Arial Black", Impact, sans-serif',
    bodyFont: '"Manrope", "Inter", sans-serif',
    cardRadius: '20px',
    inputRadius: '8px',
    buttonRadius: '10px',
    contentWidth: '80rem',
    sectionSpacing: '6rem',
    componentSpacing: '1.5rem',
  },
  content: {
    strapline: 'Flexible storefront foundations for modern independent brands.',
    footerBlurb: 'Neutral starter content for a white-label storefront. Update this configuration before launch.',
  },
};

export const businessStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: businessConfig.name,
  legalName: businessConfig.legalName,
  url: businessConfig.siteUrl,
  email: businessConfig.supportEmail,
  telephone: businessConfig.phone,
  logo: new URL(businessConfig.branding.logoPath, businessConfig.siteUrl).toString(),
  sameAs: Object.values(businessConfig.social).filter(Boolean),
};

export function buildThemeCss(config: BusinessConfig = businessConfig) {
  return `:root {
  --theme-color-primary: ${config.branding.primaryColor};
  --theme-color-secondary: ${config.branding.secondaryColor};
  --theme-color-accent: ${config.branding.accentColor};
  --theme-color-background: ${config.branding.backgroundColor};
  --theme-color-text: ${config.branding.textColor};
  --theme-color-surface: ${config.theme.surfaceColor};
  --theme-color-muted-text: ${config.theme.mutedTextColor};
  --theme-color-border: ${config.theme.borderColor};
  --theme-color-focus: ${config.theme.focusColor};
  --theme-font-heading: ${config.theme.headingFont};
  --theme-font-body: ${config.theme.bodyFont};
  --theme-radius-card: ${config.theme.cardRadius};
  --theme-radius-input: ${config.theme.inputRadius};
  --theme-radius-button: ${config.theme.buttonRadius};
  --theme-width-content: ${config.theme.contentWidth};
  --theme-space-section: ${config.theme.sectionSpacing};
  --theme-space-component: ${config.theme.componentSpacing};
}`;
}
