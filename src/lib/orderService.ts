import { formatPrice } from './format';
import {
  deriveFulfillmentStatus,
  formatOrderStatusLabel,
  orderItemCount,
  saveOrderRecord,
  sumupStatusToPaymentStatus,
  updateOrderRecord,
  type OrderAdminStatus,
  type OrderFulfillmentStatus,
  type OrderPaymentMethod,
  type OrderPaymentStatus,
  type OrderRecord,
} from './orderStore';
import type { RuntimeEnv } from './runtimeEnv';
import { retrieveSumUpCheckout, SumUpApiError, SumUpConfigError } from './sumup';
import { syncCustomerFromCompletedOrder } from './customerStore';
import { awardLoyaltyForPaidOrder, finaliseLoyaltyRedemption, reverseLoyaltyForCancelledOrder } from './loyalty';

export type OrdersFilter =
  | 'all'
  | 'online'
  | 'pos'
  | 'unfulfilled'
  | 'unpaid'
  | 'paid'
  | 'open'
  | 'failed'
  | 'expired'
  | 'cancelled';

export type OrdersMetrics = {
  orderCount: number;
  orderedItems: number;
  grossSalesPence: number;
  paidCount: number;
  pendingCount: number;
  posCount: number;
};

function containsText(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase());
}

export function formatSourceLabel(source: string) {
  if (source === 'pos') return 'POS';
  if (source === 'online') return 'Online';
  if (source === 'manual') return 'Manual';
  return source ? source.charAt(0).toUpperCase() + source.slice(1) : 'Unknown';
}

export function formatPaymentLabel(value: OrderPaymentStatus) {
  if (value === 'PAID') return 'Paid';
  if (value === 'FAILED') return 'Payment failed';
  if (value === 'EXPIRED') return 'Expired';
  if (value === 'CANCELLED') return 'Cancelled';
  if (value === 'UNKNOWN') return 'Unknown';
  return 'Payment pending';
}

export function formatFulfillmentLabel(value: OrderFulfillmentStatus) {
  if (value === 'FULFILLED') return 'Fulfilled';
  if (value === 'ON_HOLD') return 'On hold';
  return 'Unfulfilled';
}

export function formatOrderAdminStatusLabel(value: OrderAdminStatus) {
  if (value === 'ACCEPTED') return 'Accepted';
  if (value === 'IN_PROGRESS') return 'In progress';
  if (value === 'COMPLETED') return 'Completed';
  if (value === 'CANCELLED') return 'Cancelled';
  if (value === 'ON_HOLD') return 'On hold';
  return 'New';
}

export function formatPaymentMethodLabel(value: OrderPaymentMethod) {
  if (value === 'SUMUP') return 'SumUp';
  if (value === 'CARD') return 'Card';
  if (value === 'CASH') return 'Cash';
  if (value === 'OTHER') return 'Other';
  return 'Unknown';
}

export async function syncOrderWithSumUp(env: RuntimeEnv, order: OrderRecord) {
  if (!order.sumup?.checkoutId || order.source === 'pos') {
    return order;
  }

  try {
    const checkout = await retrieveSumUpCheckout(env, order.sumup.checkoutId);
    const paymentStatus = sumupStatusToPaymentStatus(checkout.status);
    const updatedOrder: OrderRecord = {
      ...order,
      paymentStatus,
      paymentMethod: 'SUMUP',
      fulfillmentStatus: order.fulfillmentStatus === 'FULFILLED'
        ? 'FULFILLED'
        : deriveFulfillmentStatus(paymentStatus, order.source),
      updatedAt: new Date().toISOString(),
      paidAt: paymentStatus === 'PAID' ? (order.paidAt ?? checkout.transactionDate ?? new Date().toISOString()) : order.paidAt,
      statusLabel: formatOrderStatusLabel({
        ...order,
        paymentStatus,
      }),
      sumup: {
        ...order.sumup,
        status: checkout.status,
        lastSyncedAt: new Date().toISOString(),
        transactionId: checkout.transactionId,
        transactionCode: checkout.transactionCode,
        transactionDate: checkout.transactionDate,
      },
    };

    await saveOrderRecord(env, updatedOrder);
    if (updatedOrder.paymentStatus === 'PAID') {
      await finaliseLoyaltyRedemption(env, updatedOrder.loyalty?.reservationId, updatedOrder);
      await awardLoyaltyForPaidOrder(env, updatedOrder);
      await syncCustomerFromCompletedOrder(env, updatedOrder);
    } else if (updatedOrder.paymentStatus === 'CANCELLED' || updatedOrder.paymentStatus === 'FAILED' || updatedOrder.paymentStatus === 'EXPIRED') {
      await reverseLoyaltyForCancelledOrder(env, updatedOrder);
    }
    return updatedOrder;
  } catch (error) {
    if (error instanceof SumUpConfigError || error instanceof SumUpApiError) {
      return order;
    }

    throw error;
  }
}

export async function syncOrdersWithSumUp(env: RuntimeEnv, orders: OrderRecord[]) {
  return Promise.all(orders.map((order) => syncOrderWithSumUp(env, order)));
}

export function filterOrders(orders: OrderRecord[], filter: OrdersFilter, query: string) {
  const normalisedQuery = query.trim().toLowerCase();

  return orders.filter((order) => {
    const matchesFilter = filter === 'all'
      ? true
      : filter === 'online'
        ? order.source !== 'pos'
        : filter === 'pos'
          ? order.source === 'pos'
          : filter === 'unfulfilled'
            ? order.fulfillmentStatus !== 'FULFILLED'
            : filter === 'unpaid'
              ? order.paymentStatus !== 'PAID'
              : filter === 'paid'
                ? order.paymentStatus === 'PAID'
                : filter === 'open'
                  ? order.paymentStatus === 'PENDING' || order.fulfillmentStatus !== 'FULFILLED' || order.orderStatus === 'NEW' || order.orderStatus === 'IN_PROGRESS'
                  : filter === 'failed'
                    ? order.paymentStatus === 'FAILED'
                    : filter === 'expired'
                      ? order.paymentStatus === 'EXPIRED'
                      : order.paymentStatus === 'CANCELLED' || order.orderStatus === 'CANCELLED';

    if (!matchesFilter) {
      return false;
    }

    if (!normalisedQuery) {
      return true;
    }

    return [
      String(order.orderNumber),
      order.reference,
      order.externalSourceId ?? '',
      order.customer.name,
      order.customer.email,
      order.customer.phone,
      order.items.map((item) => item.name).join(' '),
      order.pos?.userName ?? '',
      order.pos?.location ?? '',
      order.adminNotes ?? '',
      formatSourceLabel(order.source),
    ].some((value) => containsText(value, normalisedQuery));
  });
}

export function buildOrdersMetrics(orders: OrderRecord[]): OrdersMetrics {
  return orders.reduce<OrdersMetrics>((metrics, order) => {
    metrics.orderCount += 1;
    metrics.orderedItems += orderItemCount(order);
    metrics.grossSalesPence += order.totalPence;
    if (order.paymentStatus === 'PAID') {
      metrics.paidCount += 1;
    }
    if (order.paymentStatus === 'PENDING') {
      metrics.pendingCount += 1;
    }
    if (order.source === 'pos') {
      metrics.posCount += 1;
    }
    return metrics;
  }, {
    orderCount: 0,
    orderedItems: 0,
    grossSalesPence: 0,
    paidCount: 0,
    pendingCount: 0,
    posCount: 0,
  });
}

export function buildOrdersCsv(orders: OrderRecord[]) {
  const escapeCsv = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = [
    [
      'Order',
      'Reference',
      'Source',
      'External source ID',
      'Created at',
      'Customer',
      'Email',
      'Phone',
      'Fulfilment method',
      'Requested date',
      'Items',
      'Total',
      'Payment method',
      'Payment status',
      'Fulfilment status',
      'Order status',
      'POS staff',
      'POS location',
      'SumUp checkout',
    ],
    ...orders.map((order) => [
      `#${order.orderNumber}`,
      order.reference,
      formatSourceLabel(order.source),
      order.externalSourceId ?? '',
      order.createdAt,
      order.customer.name,
      order.customer.email,
      order.customer.phone,
      order.customer.fulfilmentMethod,
      order.customer.requestedDate,
      order.items.map((item) => `${item.name} x${item.quantity}`).join(' | '),
      formatPrice(order.totalPence / 100),
      formatPaymentMethodLabel(order.paymentMethod),
      order.paymentStatus,
      order.fulfillmentStatus,
      order.orderStatus,
      order.pos?.userName ?? '',
      order.pos?.location ?? '',
      order.sumup?.checkoutId ?? '',
    ]),
  ];

  return rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
}

export function paymentTone(status: OrderPaymentStatus) {
  if (status === 'PAID') return 'bg-[#ecefed] text-[#33413a] ring-[#d7ddd9]';
  if (status === 'FAILED' || status === 'CANCELLED') return 'bg-[#fdecec] text-[#8f2b2b] ring-[#f5d1d1]';
  if (status === 'EXPIRED') return 'bg-[#f3eef8] text-[#60457b] ring-[#e0d5ec]';
  if (status === 'UNKNOWN') return 'bg-[#edf2f6] text-[#52606c] ring-[#d7e0e8]';
  return 'bg-[#ffe7bb] text-[#8a5200] ring-[#f5d28a]';
}

export function fulfillmentTone(status: OrderFulfillmentStatus) {
  if (status === 'FULFILLED') return 'bg-[#eaf5ea] text-[#13653c] ring-[#cde6d4]';
  if (status === 'ON_HOLD') return 'bg-[#ffe7bb] text-[#8a5200] ring-[#f5d28a]';
  return 'bg-[#fff5bf] text-[#756000] ring-[#ece0a0]';
}

export function sourceTone(source: string) {
  if (source === 'pos') return 'bg-[#e7f1ff] text-[#1256a1] ring-[#cfe0ff]';
  if (source === 'manual') return 'bg-[#f3eef8] text-[#60457b] ring-[#e0d5ec]';
  return 'bg-[#ecefed] text-[#33413a] ring-[#d7ddd9]';
}

export function adminStatusTone(status: OrderAdminStatus) {
  if (status === 'ACCEPTED') return 'bg-[#e7f6ef] text-[#176343] ring-[#cce8da]';
  if (status === 'COMPLETED') return 'bg-[#eaf5ea] text-[#13653c] ring-[#cde6d4]';
  if (status === 'CANCELLED') return 'bg-[#fdecec] text-[#8f2b2b] ring-[#f5d1d1]';
  if (status === 'ON_HOLD') return 'bg-[#ffe7bb] text-[#8a5200] ring-[#f5d28a]';
  if (status === 'IN_PROGRESS') return 'bg-[#e7f1ff] text-[#1256a1] ring-[#cfe0ff]';
  return 'bg-[#f4f5f6] text-[#4c5560] ring-[#e3e7ea]';
}

export async function manuallySetOrderFulfillmentStatus(
  env: RuntimeEnv,
  reference: string,
  fulfillmentStatus: OrderFulfillmentStatus
) {
  return updateOrderRecord(env, reference, (order) => {
    const nextOrder: OrderRecord = {
      ...order,
      fulfillmentStatus,
      updatedAt: new Date().toISOString(),
      statusLabel: formatOrderStatusLabel({
        ...order,
        fulfillmentStatus,
      }),
      timeline: [
        {
          label: fulfillmentStatus === 'FULFILLED' ? 'Order marked fulfilled' : 'Order marked unfulfilled',
          at: new Date().toISOString(),
          status: fulfillmentStatus,
        },
        ...order.timeline,
      ].slice(0, 50),
    };

    return nextOrder;
  });
}

export async function updateAdminOrderFields(
  env: RuntimeEnv,
  reference: string,
  fields: {
    orderStatus: OrderAdminStatus;
    adminNotes: string;
  }
) {
  return updateOrderRecord(env, reference, (order) => {
    const nextOrder: OrderRecord = {
      ...order,
      orderStatus: fields.orderStatus,
      adminNotes: fields.adminNotes.trim() || undefined,
      updatedAt: new Date().toISOString(),
      statusLabel: formatOrderStatusLabel({
        ...order,
        orderStatus: fields.orderStatus,
      }),
      timeline: [
        {
          label: 'Admin order details updated',
          at: new Date().toISOString(),
          status: fields.orderStatus,
          meta: {
            hasNotes: Boolean(fields.adminNotes.trim()),
          },
        },
        ...order.timeline,
      ].slice(0, 50),
    };

    return nextOrder;
  });
}
