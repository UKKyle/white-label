import type { Product, ProductVariant } from '../types/shop';
import { businessConfig } from '../config/business';

export function formatPrice(value: number): string {
  const hasPence = value % 1 !== 0;

  return new Intl.NumberFormat(businessConfig.locale, {
    style: 'currency',
    currency: businessConfig.currency,
    minimumFractionDigits: hasPence ? 2 : 0,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatPriceRange(values: number[]): string {
  const filtered = values.filter((value) => Number.isFinite(value));

  if (!filtered.length) return '';

  const min = Math.min(...filtered);
  const max = Math.max(...filtered);

  return min === max ? formatPrice(min) : `${formatPrice(min)} - ${formatPrice(max)}`;
}

export function formatPreviewPrice(value: number): string {
  const rounded = Math.round(value);

  return new Intl.NumberFormat(businessConfig.locale, {
    style: 'currency',
    currency: businessConfig.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(rounded);
}

export function getProductPriceLabel(product: Pick<Product, 'price' | 'variants'>): string {
  const variantPrices = (product.variants ?? []).map((variant: ProductVariant) => variant.price);

  if (variantPrices.length) {
    const validPrices = variantPrices.filter((value) => Number.isFinite(value) && value > 0);
    return validPrices.length ? `From ${formatPreviewPrice(Math.min(...validPrices))}` : '';
  }

  return formatPreviewPrice(product.price);
}

export function stars(count: number): string {
  return '★'.repeat(count);
}
