import { formatPrice } from './format';
import type { OrderRecord } from './orderStore';

export const accountDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function formatAccountDate(value?: string) {
  if (!value) return 'To be confirmed';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : accountDateFormatter.format(date);
}

export function accountOrderStatus(order: OrderRecord) {
  if (order.paymentStatus === 'PAID' && order.orderStatus === 'ACCEPTED') return 'Confirmed';
  if (order.paymentStatus === 'PAID') return 'Received';
  if (order.paymentStatus === 'FAILED') return 'Payment failed';
  if (order.paymentStatus === 'CANCELLED') return 'Cancelled';
  if (order.paymentStatus === 'EXPIRED') return 'Expired';
  return 'Payment pending';
}

export function accountOrderTotal(order: OrderRecord) {
  return formatPrice(order.totalPence / 100);
}

