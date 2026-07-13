import type { BlockInstance, GlobalThemeSettings, PageConfiguration, SectionInstance, StorefrontTemplateManifest, TemplateKey, ThemeSettings } from '../../types/storefront';

let deterministicIdCounter = 0;
const id = (prefix: string) => `${prefix}-${++deterministicIdCounter}`;

function globalSettings(overrides: Partial<GlobalThemeSettings>): GlobalThemeSettings {
  return {
    storeNameDisplay: 'Your Store',
    logoText: 'YS',
    primaryColor: '#17202a',
    secondaryColor: '#edf1f5',
    accentColor: '#3863d9',
    backgroundColor: '#f7f8fa',
    surfaceColor: '#ffffff',
    textColor: '#17202a',
    mutedTextColor: '#66717f',
    borderColor: '#e3e7ed',
    headingFont: 'Inter',
    bodyFont: 'Inter',
    buttonRadius: 8,
    cardRadius: 8,
    sectionSpacing: 72,
    contentWidth: 1180,
    productCardStyle: 'bordered',
    ...overrides,
  };
}

function block(type: string, label: string, settings: ThemeSettings): BlockInstance {
  return { id: id('block'), type, label, visible: true, order: 0, settings };
}

function section(type: string, label: string, order: number, settings: ThemeSettings, blocks: BlockInstance[] = []): SectionInstance {
  return { id: id('section'), type, label, visible: true, order, settings, blocks: blocks.map((item, index) => ({ ...item, order: index })) };
}

function homepage(title: string, sections: SectionInstance[]): PageConfiguration {
  return { id: 'home', pageType: 'home', title, handle: '/', status: 'draft', sections, seo: { title, description: 'Preview storefront content. Replace all placeholder copy before launch.' } };
}

export const sectionLibrary = [
  'announcement',
  'header',
  'hero',
  'slideshow',
  'image_banner',
  'video_banner',
  'rich_text',
  'image_with_text',
  'multi_column',
  'featured_collection',
  'product_grid',
  'featured_product',
  'collection_list',
  'category_grid',
  'promo_banner',
  'logo_list',
  'benefits',
  'testimonials',
  'faq',
  'gallery',
  'before_after',
  'newsletter',
  'contact_callout',
  'custom_order_callout',
  'social_grid',
  'map_location',
  'opening_hours',
  'divider',
  'spacer',
  'footer',
] as const;

export const blockLibrary = ['heading', 'text', 'button', 'image', 'quote', 'faq_item', 'column', 'product_source'] as const;

export const templates: StorefrontTemplateManifest[] = [
  {
    key: 'editorial',
    name: 'Editorial',
    description: 'Image-led layouts for premium, boutique and lifestyle brands.',
    businessTypes: ['Fashion', 'Beauty', 'Homeware', 'Lifestyle', 'Boutique retail'],
    characteristics: ['Large media', 'Spacious storytelling', 'Refined product cards', 'Editorial typography'],
    defaultSettings: globalSettings({ primaryColor: '#171717', accentColor: '#9b6a43', backgroundColor: '#fbfaf8', productCardStyle: 'minimal', sectionSpacing: 88 }),
    defaultPage: homepage('Editorial homepage', [
      section('announcement', 'Announcement bar', 0, { text: 'Free delivery on selected orders', alignment: 'center' }),
      section('header', 'Header', 1, { layout: 'centered_logo', sticky: true }),
      section('hero', 'Editorial hero', 2, { eyebrow: 'New season', heading: 'A considered store for modern products', body: 'Shape this area with your own campaign, collection or brand story.', mediaPosition: 'right', height: 'large' }, [
        block('button', 'Primary button', { label: 'Shop now', href: '/store/demo/collections/all', style: 'primary' }),
      ]),
      section('featured_collection', 'Featured collection', 3, { heading: 'Featured collection', productCount: 4, layout: 'editorial_grid' }),
      section('image_with_text', 'Image and text', 4, { heading: 'Designed around the details', body: 'Use this section for craft, process, materials or a seasonal story.', imagePosition: 'left' }),
      section('featured_product', 'Product spotlight', 5, { heading: 'Product spotlight', layout: 'split' }),
      section('rich_text', 'Brand story', 6, { heading: 'A story worth telling', body: 'Introduce the people, point of view and standards behind the store.' }),
      section('testimonials', 'Testimonials', 7, { heading: 'What customers say' }, [block('quote', 'Customer quote', { quote: 'Beautifully presented and easy to love.', attribution: 'Preview customer' })]),
      section('newsletter', 'Newsletter', 8, { heading: 'Join the list', body: 'Share launches, offers and useful updates.' }),
      section('footer', 'Footer', 9, { layout: 'columns' }),
    ]),
  },
  {
    key: 'commerce',
    name: 'Commerce',
    description: 'Conversion-focused structure for larger catalogues and practical retail.',
    businessTypes: ['General retail', 'Electronics', 'Vape stores', 'Convenience', 'Multi-category shops'],
    characteristics: ['Dense product grids', 'Category-first navigation', 'Promotional banners', 'Search visibility'],
    defaultSettings: globalSettings({ primaryColor: '#123047', accentColor: '#f2a900', backgroundColor: '#f4f6f8', productCardStyle: 'bordered', sectionSpacing: 56 }),
    defaultPage: homepage('Commerce homepage', [
      section('announcement', 'Announcement bar', 0, { text: 'Today only: highlight your strongest offer', alignment: 'center' }),
      section('header', 'Utility header', 1, { layout: 'search_first', sticky: true, showSearch: true }),
      section('hero', 'Promotional hero', 2, { eyebrow: 'Featured offer', heading: 'Everything shoppers need, fast', body: 'Put your main category, promotion or best-selling range here.', mediaPosition: 'background', height: 'medium' }),
      section('category_grid', 'Category grid', 3, { heading: 'Shop by category', columnsDesktop: 4, columnsMobile: 2 }),
      section('product_grid', 'Featured products', 4, { heading: 'Featured products', productCount: 8, columnsDesktop: 4 }),
      section('promo_banner', 'Promotional banner', 5, { heading: 'Bundle, save, repeat', body: 'Use this for bundles, delivery thresholds or seasonal deals.' }),
      section('product_grid', 'Best sellers', 6, { heading: 'Best sellers', productCount: 8, columnsDesktop: 4 }),
      section('benefits', 'Service strip', 7, { heading: 'Why buy here' }, [
        block('column', 'Fast fulfilment', { heading: 'Fast fulfilment', text: 'Clear pickup, delivery or dispatch options.' }),
        block('column', 'Secure checkout', { heading: 'Secure checkout', text: 'Shared platform checkout foundations.' }),
        block('column', 'Support', { heading: 'Support', text: 'Help customers choose confidently.' }),
      ]),
      section('rich_text', 'Recently viewed foundation', 8, { heading: 'Recently viewed', body: 'This section is ready for browsing-history features.' }),
      section('newsletter', 'Newsletter', 9, { heading: 'Get offers first', body: 'Capture interested shoppers without using legacy popups.' }),
      section('footer', 'Footer', 10, { layout: 'dense_columns' }),
    ]),
  },
  {
    key: 'studio',
    name: 'Studio',
    description: 'Personality-led layouts for small businesses, creators and enquiry-led stores.',
    businessTypes: ['Creators', 'Artists', 'Custom products', 'Small businesses', 'Service-product hybrids'],
    characteristics: ['Story-led sections', 'Gallery support', 'Custom enquiry callouts', 'Curated product grids'],
    defaultSettings: globalSettings({ primaryColor: '#24312f', accentColor: '#d26f49', backgroundColor: '#fbf7f2', productCardStyle: 'elevated', sectionSpacing: 68 }),
    defaultPage: homepage('Studio homepage', [
      section('announcement', 'Announcement bar', 0, { text: 'Books are open for new orders', alignment: 'center' }),
      section('header', 'Header', 1, { layout: 'left_logo', sticky: false }),
      section('hero', 'Brand hero', 2, { eyebrow: 'Independent store', heading: 'Products with a point of view', body: 'Tell people who you are, what you make and how to buy from you.', mediaPosition: 'right', height: 'medium' }),
      section('featured_collection', 'Featured products or services', 3, { heading: 'Featured work', productCount: 3, layout: 'curated' }),
      section('image_with_text', 'About section', 4, { heading: 'Meet the maker', body: 'Use this section for process, story or service context.', imagePosition: 'right' }),
      section('gallery', 'Gallery', 5, { heading: 'Gallery', columnsDesktop: 3 }),
      section('custom_order_callout', 'Custom order callout', 6, { heading: 'Need something custom?', body: 'Invite enquiries without hardcoding any industry.' }),
      section('testimonials', 'Testimonials', 7, { heading: 'Kind words' }, [block('quote', 'Customer quote', { quote: 'The whole experience felt personal and polished.', attribution: 'Preview customer' })]),
      section('social_grid', 'Social grid', 8, { heading: 'Latest moments', columnsDesktop: 4 }),
      section('contact_callout', 'Contact callout', 9, { heading: 'Start a conversation', body: 'Point customers to contact, bookings or email.' }),
      section('footer', 'Footer', 10, { layout: 'simple' }),
    ]),
  },
];

export function getTemplate(key: TemplateKey) {
  return templates.find((template) => template.key === key) ?? null;
}

export function createDefaultConfiguration(templateKey: TemplateKey) {
  const template = getTemplate(templateKey);
  if (!template) throw new Error('Unknown template');
  return {
    schemaVersion: 1,
    templateKey,
    globalSettings: { ...template.defaultSettings },
    pages: {
      home: JSON.parse(JSON.stringify(template.defaultPage)) as PageConfiguration,
      collection: { id: 'collection', pageType: 'collection' as const, title: 'Collection', handle: '/collections/all', status: 'draft' as const, sections: [section('product_grid', 'Collection product grid', 0, { heading: 'All products', productCount: 12, columnsDesktop: 4 })] },
      product: { id: 'product', pageType: 'product' as const, title: 'Product detail', handle: '/products/sample', status: 'draft' as const, sections: [section('featured_product', 'Product detail', 0, { heading: 'Product detail', layout: 'gallery_left' })] },
      cart: { id: 'cart', pageType: 'cart' as const, title: 'Cart', handle: '/cart', status: 'draft' as const, sections: [section('rich_text', 'Cart foundation', 0, { heading: 'Your cart', body: 'Cart line items and checkout handoff render here.' })] },
      contact: { id: 'contact', pageType: 'contact' as const, title: 'Contact', handle: '/contact', status: 'draft' as const, sections: [section('contact_callout', 'Contact', 0, { heading: 'Contact us', body: 'Add store contact details and response expectations.' })] },
      not_found: { id: 'not_found', pageType: 'not_found' as const, title: 'Page not found', handle: '/404', status: 'draft' as const, sections: [section('rich_text', 'Not found', 0, { heading: 'Page not found', body: 'Help customers return to shopping.' })] },
    },
    navigation: {
      mainMenu: [
        { id: id('nav'), label: 'Shop', href: '/collections/all', visible: true, order: 0 },
        { id: id('nav'), label: 'About', href: '/pages/about', visible: true, order: 1 },
        { id: id('nav'), label: 'Contact', href: '/contact', visible: true, order: 2 },
      ],
      footerMenu: [
        { id: id('nav'), label: 'Privacy', href: '/policies/privacy', visible: true, order: 0 },
        { id: id('nav'), label: 'Terms', href: '/policies/terms', visible: true, order: 1 },
      ],
    },
  };
}
