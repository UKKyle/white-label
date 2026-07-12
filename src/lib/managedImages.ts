import type { Product } from '../types/shop';
import { businessConfig } from '../config/business';

export type ManagedImageDefinition = {
  id: string;
  label: string;
  usage: string;
  fallbackSrc: string;
  alt: string;
};

export const managedImages = [
  {
    id: 'site-logo',
    label: 'Site logo',
    usage: 'Header and footer logo',
    fallbackSrc: businessConfig.branding.logoPath,
    alt: `${businessConfig.name} logo`,
  },
  {
    id: 'home-hero-cake',
    label: 'Homepage hero cake',
    usage: 'Large hero image at the top of the homepage',
    fallbackSrc: '/images/baked-by-mady/hero-cake.png',
    alt: 'Celebration cake by Crumb Works',
  },
  {
    id: 'home-highlight-cake',
    label: 'Homepage highlight: Cake',
    usage: 'CAKE card in the four-card homepage highlight reel',
    fallbackSrc: '/images/baked-by-mady/gallery-cake.jpeg',
    alt: 'Cake by Crumb Works',
  },
  {
    id: 'home-highlight-cookies',
    label: 'Homepage highlight: Cookies',
    usage: 'COOKIES card in the four-card homepage highlight reel',
    fallbackSrc: '/images/baked-by-mady/cookie-box.jpeg',
    alt: 'Cookies and sweet treats by Crumb Works',
  },
  {
    id: 'home-highlight-cupcakes',
    label: 'Homepage highlight: Cupcakes',
    usage: 'CUPCAKES card in the four-card homepage highlight reel',
    fallbackSrc: '/images/baked-by-mady/cupcake-box.jpeg',
    alt: 'Cupcakes by Crumb Works',
  },
  {
    id: 'home-highlight-and-more',
    label: 'Homepage highlight: And more',
    usage: 'AND MORE! card in the four-card homepage highlight reel',
    fallbackSrc: '/images/baked-by-mady/brownie-tray.jpeg',
    alt: 'Brownies and more by Crumb Works',
  },
  {
    id: 'gallery-cake',
    label: 'Gallery cake',
    usage: 'Homepage gallery, celebration detail, and Celebration Cake product',
    fallbackSrc: '/images/baked-by-mady/gallery-cake.jpeg',
    alt: 'Custom cake by Crumb Works',
  },
  {
    id: 'gallery-cupcakes',
    label: 'Gallery cupcakes',
    usage: 'Homepage gallery cupcakes image',
    fallbackSrc: '/images/baked-by-mady/gallery-cupcakes.png',
    alt: 'Cupcakes by Crumb Works',
  },
  {
    id: 'gallery-brownies',
    label: 'Gallery brownies',
    usage: 'Homepage gallery brownies image',
    fallbackSrc: '/images/baked-by-mady/gallery-brownies.png',
    alt: 'Brownies by Crumb Works',
  },
  {
    id: 'product-cupcake-box',
    label: 'Cupcake Box product image',
    usage: 'Cupcake Box cards, product page, and homepage detail image',
    fallbackSrc: '/images/baked-by-mady/cupcake-box.jpeg',
    alt: 'Cupcake box by Crumb Works',
  },
  {
    id: 'product-brownie-tray',
    label: 'Brownie Tray product image',
    usage: 'Brownie Tray cards and product page',
    fallbackSrc: '/images/baked-by-mady/brownie-tray.jpeg',
    alt: 'Brownie tray by Crumb Works',
  },
  {
    id: 'product-mini-treat-box',
    label: 'Mini Treat Box product image',
    usage: 'Mini Treat Box cards and product page',
    fallbackSrc: '/images/baked-by-mady/cookie-box.jpeg',
    alt: 'Treat box by Crumb Works',
  },
] as const satisfies ManagedImageDefinition[];

export type ManagedImageId = typeof managedImages[number]['id'];

export const productImageIdsBySlug: Record<string, ManagedImageId> = {
  'celebration-cake': 'gallery-cake',
  'cupcake-box': 'product-cupcake-box',
  'brownie-tray': 'product-brownie-tray',
  'mini-treat-box': 'product-mini-treat-box',
};

const imageById = new Map<string, ManagedImageDefinition>(managedImages.map((image) => [image.id, image]));

export function getManagedImageDefinition(id: string) {
  return imageById.get(id) ?? null;
}

export function managedImagePath(id: string, updatedAt?: string) {
  const query = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : '';
  return `/cms-images/${encodeURIComponent(id)}${query}`;
}

export function withManagedProductImages(
  products: Product[],
  getImageSrc: (id: ManagedImageId) => string
): Product[] {
  return products.map((product) => {
    const imageId = productImageIdsBySlug[product.slug];

    if (!imageId) {
      return product;
    }

    return {
      ...product,
      image: getImageSrc(imageId),
    };
  });
}
