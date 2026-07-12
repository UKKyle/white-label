import type { FaqItem, NavItem, Product, Testimonial } from '../types/shop';
import type { ManagedImageId } from '../lib/managedImages';
import { businessConfig } from '../config/business';

export const brand = {
  name: businessConfig.name,
  strapline: businessConfig.content.strapline,
  email: businessConfig.supportEmail,
  phone: businessConfig.phone,
  logoPath: businessConfig.branding.logoPath
};

export const navItems: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Shop', href: '/products' },
  { label: 'About', href: '/about' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' }
];

export const trustPoints = [
  businessConfig.commerce.collectionEnabled ? 'Collection is enabled and can be tailored per brand.' : 'Collection is currently disabled in configuration.',
  businessConfig.commerce.deliveryEnabled ? 'Delivery is enabled and can be tailored per brand.' : 'Delivery is currently disabled in configuration.',
  'Update product, loyalty, and contact content to match your brand before launch.'
];

export type HomepageHighlight = {
  label: 'CAKE' | 'COOKIES' | 'CUPCAKES' | 'AND MORE!';
  imageId: ManagedImageId;
  href: string;
};

export const homepageHighlights: HomepageHighlight[] = [
  { label: 'CAKE', imageId: 'home-highlight-cake', href: '/products' },
  { label: 'COOKIES', imageId: 'home-highlight-cookies', href: '/products' },
  { label: 'CUPCAKES', imageId: 'home-highlight-cupcakes', href: '/products' },
  { label: 'AND MORE!', imageId: 'home-highlight-and-more', href: '/products' }
];

export const products: Product[] = [
  {
    slug: 'celebration-cake',
    name: 'Celebration Cake',
    category: 'Bespoke Cakes',
    tagline: 'Custom celebration cakes for birthdays, milestones and special occasions.',
    price: 48,
    accent: '#f498b8',
    glow: '#ffd3e3',
    image: '/images/baked-by-mady/gallery-cake.jpeg',
    imageAlt: 'Celebration cake by Crumb Works',
    description:
      'A handmade celebration cake prepared to order and finished for birthdays, gatherings and milestone moments.',
    features: ['Made to order', 'Ideal for celebrations', 'Collection or local delivery'],
    variants: [
      { flavour: 'Oreo', servingSize: '4 servings', price: 48 },
      { flavour: 'Oreo', servingSize: '6 servings', price: 64 },
      { flavour: 'Oreo', servingSize: '12 servings', price: 96 }
    ]
  },
  {
    slug: 'cupcake-box',
    name: 'Cupcake Box',
    category: 'Cupcakes',
    tagline: 'Handmade cupcake boxes for birthdays, gifting and dessert tables.',
    price: 10.99,
    accent: '#7fdcff',
    glow: '#d2f4ff',
    image: '/images/baked-by-mady/cupcake-box.jpeg',
    imageAlt: 'Cupcake box by Crumb Works',
    description:
      'Freshly baked handmade cupcake boxes, beautifully presented and available in boxes of 4, 6 or 12.',
    features: ['Freshly baked to order', 'Beautifully boxed', 'Ideal for gifting or parties'],
    variants: [
      { flavour: 'Oreo', servingSize: '4 servings', price: 10.99 },
      { flavour: 'Oreo', servingSize: '6 servings', price: 16.99 },
      { flavour: 'Oreo', servingSize: '12 servings', price: 21.99 }
    ]
  },
  {
    slug: 'brownie-tray',
    name: 'Brownie Tray',
    category: 'Traybakes',
    tagline: 'Rich chocolate brownies for sharing, gifting and weekend treats.',
    price: 13.99,
    accent: '#b58a61',
    glow: '#e9ccb1',
    image: '/images/baked-by-mady/brownie-tray.jpeg',
    imageAlt: 'Brownie tray by Crumb Works',
    description:
      'A rich chocolate brownie bake prepared to order in 4, 6 or 12 servings for sharing, gifting or dessert tables.',
    features: ['Fudgy and rich', 'Cut and boxed to order', 'Easy gifting option'],
    variants: [
      { flavour: 'Oreo', servingSize: '4 servings', price: 13.99 },
      { flavour: 'Oreo', servingSize: '6 servings', price: 18.99 },
      { flavour: 'Oreo', servingSize: '12 servings', price: 24.99 }
    ]
  },
  {
    slug: 'mini-treat-box',
    name: 'Mini Treat Box',
    category: 'Dessert Boxes',
    tagline: 'A handmade dipping box for sweet cravings, gifting and small celebrations.',
    price: 12,
    accent: '#c6a0ff',
    glow: '#eadcff',
    image: '/images/baked-by-mady/cookie-box.jpeg',
    imageAlt: 'Treat box by Crumb Works',
    description:
      'Treat yourself to a selection of handcrafted desserts paired with dipping sauces.',
    features: ['Handmade in small batches', 'Fun gifting option', 'Collection or local delivery']
  }
];

export const testimonials: Testimonial[] = [
  {
    name: 'Stacy P.',
    role: 'Verified customer',
    rating: 5,
    quote: "Have used Mady numerous times for some amazing sweet treats! They are so tasty and always presented so beautifully. I've had beautiful cupcakes to give as presents and the mixed box of cookies and brownies are to die for!"
  },
  {
    name: 'Joel B.',
    role: 'Verified customer',
    rating: 5,
    quote: "Highly recommend, amazing products for fair prices couldn't be happier."
  },
  {
    name: 'Charlotte H.',
    role: 'Verified customer',
    rating: 5,
    quote: 'I highly recommend her cakes are amazing and currently ordering another set of cupcakes from her.'
  }
];

export const faqs: FaqItem[] = [
  {
    question: 'How much notice do I need to give for custom creations?',
    answer:
      'We recommend getting in touch as early as possible, as dates can book up quickly, especially around weekends, holidays and key events. For smaller bespoke treats, we ask for a minimum of 48 hours notice where possible. For custom cakes or larger orders, more notice may be required depending on the design, size and availability.'
  },
  {
    question: 'Do you offer customisations?',
    answer:
      'Yes, we offer custom designs for bespoke cakes and treats. Please complete our custom cake enquiry form with as much detail as possible, including your theme, colours, flavours, occasion, date needed and any inspiration photos. We will then review your enquiry and let you know what is possible based on your design, budget and our availability.'
  },
  {
    question: 'Can you cater for allergies?',
    answer:
      'Yes, we can discuss allergy requirements for custom orders. Please contact us directly before placing your order and we will provide an allergy information sheet where needed. Please note that while care is taken, our products may be prepared in an environment where common allergens are present.'
  },
  {
    question: 'How do I place an order?',
    answer:
      'To place an order, please visit the Contact Us section of our website. There, you can either complete the contact form with your order details or use the WhatsApp button to message us directly. Once we have reviewed your enquiry, we will get back to you to confirm availability, details and pricing.'
  },
  {
    question: 'Are there collection and delivery options available?',
    answer:
      'Yes, we offer both collection and delivery. Delivery is available within a reasonable distance and may incur an additional charge depending on your location. We will confirm collection or delivery options when discussing your order.'
  }
];
