export interface NavItem {
  label: string;
  href: string;
}

export interface ProductVariant {
  flavour?: string;
  servingSize?: string;
  price: number;
}

export interface Product {
  slug: string;
  name: string;
  category: string;
  tagline: string;
  price: number;
  enquireOnly?: boolean;
  accent: string;
  glow: string;
  image: string;
  imageAlt: string;
  description: string;
  features: string[];
  variants?: ProductVariant[];
}

export interface FeatureCard {
  title: string;
  description: string;
  stat: string;
}

export interface Testimonial {
  name: string;
  role: string;
  quote: string;
  rating: number;
}

export interface FaqItem {
  question: string;
  answer: string;
}
