import { brand } from '../data/site';
import { formatPrice } from './format';
import { getOrderByReference, saveOrderRecord, type OrderRecord } from './orderStore';
import type { RuntimeEnv } from './runtimeEnv';
import { isEmail } from '../security/sanitize';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const ORDER_EMAIL_LOGO_URL = 'https://www.thecrumbworks.co.uk/images/crumb-works-logo-transparent.png';
const ORDER_EMAIL_CONTACT = 'hello@thecrumbworks.co.uk';

type OrderEmailKind = 'received' | 'accepted';

type OrderEmailConfig = {
  apiKey: string;
  from: string;
  replyTo: string;
};

export class OrderEmailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderEmailConfigError';
  }
}

export class OrderEmailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderEmailSendError';
  }
}

function getOrderEmailConfig(env: RuntimeEnv): OrderEmailConfig {
  const apiKey = typeof env.RESEND_API_KEY === 'string' ? env.RESEND_API_KEY.trim() : '';
  const from = typeof env.ORDER_EMAIL_FROM === 'string' ? env.ORDER_EMAIL_FROM.trim() : '';
  const replyTo = typeof env.ORDER_EMAIL_REPLY_TO === 'string' && env.ORDER_EMAIL_REPLY_TO.trim()
    ? env.ORDER_EMAIL_REPLY_TO.trim()
    : brand.email;

  if (!apiKey || !from) {
    throw new OrderEmailConfigError(
      'Order email sending is not configured. Add RESEND_API_KEY and ORDER_EMAIL_FROM before sending customer order emails.'
    );
  }

  return { apiKey, from, replyTo };
}

function formatFulfilmentMethod(method: OrderRecord['customer']['fulfilmentMethod']) {
  if (method === 'pos') return 'In person';
  return method.charAt(0).toUpperCase() + method.slice(1);
}

function buildOrderSummaryText(order: OrderRecord) {
  const items = order.items
    .map((item) => `- ${item.quantity} x ${item.name}${[item.flavour, item.servingSize].filter(Boolean).length ? ` (${[item.flavour, item.servingSize].filter(Boolean).join(', ')})` : ''}`)
    .join('\n');

  return [
    `Order reference: ${order.reference}`,
    `Requested date: ${order.customer.requestedDate || 'To be confirmed'}`,
    `Fulfilment: ${formatFulfilmentMethod(order.customer.fulfilmentMethod)}`,
    order.loyalty?.redeemedPence ? `Loyalty Points redeemed: ${order.loyalty.redeemedPoints ?? order.loyalty.redeemedPence} points (${formatPrice(order.loyalty.redeemedPence / 100)})` : '',
    `Total: ${formatPrice(order.totalPence / 100)}`,
    '',
    'Items:',
    items || '- No items recorded',
  ].join('\n');
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildSummaryRow(label: string, value: string) {
  return `
    <tr>
      <td style="padding:10px 0;color:#8a5b6d;font-size:13px;line-height:18px;">${label}</td>
      <td style="padding:10px 0;color:#3d2930;font-size:14px;line-height:20px;font-weight:700;text-align:right;">${escapeHtml(value)}</td>
    </tr>
  `;
}

function buildOrderSummaryHtml(order: OrderRecord) {
  const items = order.items.length
    ? order.items.map((item) => {
        const details = [item.flavour, item.servingSize].filter(Boolean).join(', ');
        return `
          <tr>
            <td style="padding:14px 0;border-top:1px solid #f6dbe5;color:#3d2930;font-size:14px;line-height:20px;">
              <strong style="font-weight:700;">${escapeHtml(item.name)}</strong>
              ${details ? `<div style="margin-top:3px;color:#8a5b6d;font-size:13px;line-height:18px;">${escapeHtml(details)}</div>` : ''}
            </td>
            <td style="padding:14px 0;border-top:1px solid #f6dbe5;color:#3d2930;font-size:14px;line-height:20px;font-weight:700;text-align:right;white-space:nowrap;">Qty ${escapeHtml(String(item.quantity))}</td>
          </tr>
        `;
      }).join('')
    : `
      <tr>
        <td colspan="2" style="padding:14px 0;border-top:1px solid #f6dbe5;color:#8a5b6d;font-size:14px;line-height:20px;">No items recorded</td>
      </tr>
    `;

  return `
    <div style="margin:28px 0;padding:22px;border:1px solid #f3cbd9;border-radius:14px;background:#fff8fb;">
      <h2 style="margin:0 0 14px;color:#3d2930;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;">Order summary</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${buildSummaryRow('Order reference', order.reference)}
        ${buildSummaryRow('Requested date', order.customer.requestedDate || 'To be confirmed')}
        ${buildSummaryRow('Fulfilment', formatFulfilmentMethod(order.customer.fulfilmentMethod))}
        ${order.loyalty?.redeemedPence ? buildSummaryRow('Loyalty Points redeemed', `${order.loyalty.redeemedPoints ?? order.loyalty.redeemedPence} points (${formatPrice(order.loyalty.redeemedPence / 100)})`) : ''}
        ${buildSummaryRow('Total', formatPrice(order.totalPence / 100))}
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;border-collapse:collapse;">
        ${items}
      </table>
    </div>
  `;
}

function buildBrandedOrderEmailHtml(options: {
  previewLabel: string;
  statusLabel: string;
  heading: string;
  intro: string[];
  summaryHtml: string;
  ctaCopy: string;
}) {
  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>${escapeHtml(options.previewLabel)}</title>
      </head>
      <body style="margin:0;padding:0;background:#ffd8e6;font-family:Arial,Helvetica,sans-serif;color:#3d2930;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#ffd8e6;">
          <tr>
            <td align="center" style="padding:28px 14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;border-collapse:collapse;">
                <tr>
                  <td align="center" style="padding:0 0 18px;">
                    <img src="${ORDER_EMAIL_LOGO_URL}" width="168" alt="The Crumb Works" style="display:block;width:168px;max-width:70%;height:auto;border:0;" />
                  </td>
                </tr>
                <tr>
                  <td style="background:#ffffff;border-radius:18px;padding:34px 28px;">
                    <div style="display:inline-block;margin:0 0 18px;padding:7px 12px;border-radius:999px;background:#ffe8f0;color:#a43f66;font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">${escapeHtml(options.statusLabel)}</div>
                    <h1 style="margin:0 0 16px;color:#3d2930;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:34px;font-weight:700;">${escapeHtml(options.heading)}</h1>
                    ${options.intro.map((paragraph) => `<p style="margin:0 0 14px;color:#5c3d48;font-size:16px;line-height:24px;">${escapeHtml(paragraph)}</p>`).join('')}
                    <p style="margin:0 0 14px;color:#5c3d48;font-size:16px;line-height:24px;">Bespoke cake, brownies and treat boxes made for real celebrations.</p>
                    ${options.summaryHtml}
                    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border-collapse:collapse;">
                      <tr>
                        <td style="border-radius:999px;background:#d94d7d;">
                          <a href="mailto:${ORDER_EMAIL_CONTACT}" style="display:inline-block;padding:13px 20px;color:#ffffff;font-size:15px;line-height:18px;font-weight:700;text-decoration:none;">Reply to The Crumb Works</a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:0;color:#8a5b6d;font-size:14px;line-height:21px;">${escapeHtml(options.ctaCopy)} <a href="mailto:${ORDER_EMAIL_CONTACT}" style="color:#d94d7d;font-weight:700;text-decoration:underline;">${ORDER_EMAIL_CONTACT}</a>.</p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:18px 16px 0;color:#8a5b6d;font-size:12px;line-height:18px;">
                    The Crumb Works<br />
                    Handmade celebration bakes, brownies and treat boxes.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>`;
}

function buildEmailContent(order: OrderRecord, kind: OrderEmailKind) {
  const customerName = order.customer.name || 'there';
  const summary = buildOrderSummaryText(order);
  const summaryHtml = buildOrderSummaryHtml(order);

  if (kind === 'accepted') {
    return {
      subject: 'Your order is confirmed | The Crumb Works',
      text: [
        `Hi ${customerName},`,
        '',
        'Good news - your order with The Crumb Works has been accepted and confirmed.',
        '',
        'We will prepare everything according to the order details below.',
        '',
        'Order summary:',
        summary,
        '',
        'Bespoke cake, brownies and treat boxes made for real celebrations.',
        '',
        `If anything needs changing, please contact us as soon as possible at ${ORDER_EMAIL_CONTACT}.`,
        '',
        'Thank you,',
        'The Crumb Works',
        ORDER_EMAIL_CONTACT,
      ].join('\n'),
      html: buildBrandedOrderEmailHtml({
        previewLabel: 'Your order is confirmed | The Crumb Works',
        statusLabel: 'Order confirmed',
        heading: `Thank you, ${customerName}. Your order is confirmed.`,
        intro: [
          'Good news - your order with The Crumb Works has been accepted and confirmed.',
          'We will prepare everything according to the order details below.',
        ],
        summaryHtml,
        ctaCopy: 'If anything needs changing, please contact us as soon as possible at',
      }),
    };
  }

  return {
    subject: "We've received your order | The Crumb Works",
    text: [
      `Hi ${customerName},`,
      '',
      'Thank you for placing an order request with The Crumb Works.',
      '',
      'We have received your details and requested date, and will review them shortly.',
      '',
      'Your order is not confirmed until it has been accepted by The Crumb Works. We will send a second email once it has been accepted.',
      '',
      'Order summary:',
      summary,
      '',
      'Bespoke cake, brownies and treat boxes made for real celebrations.',
      '',
      `If anything looks incorrect, please contact us at ${ORDER_EMAIL_CONTACT}.`,
      '',
      'Thank you,',
      'The Crumb Works',
      ORDER_EMAIL_CONTACT,
    ].join('\n'),
    html: buildBrandedOrderEmailHtml({
      previewLabel: "We've received your order | The Crumb Works",
      statusLabel: 'Order received',
      heading: `Thank you, ${customerName}. We have received your order request.`,
      intro: [
        'Thank you for placing an order request with The Crumb Works.',
        'We have received your details and requested date, and will review them shortly.',
        'Your order is not confirmed until it has been accepted by The Crumb Works. We will send a second email once it has been accepted.',
      ],
      summaryHtml,
      ctaCopy: 'If anything looks incorrect, please contact us at',
    }),
  };
}

async function sendWithResend(env: RuntimeEnv, order: OrderRecord, kind: OrderEmailKind) {
  const config = getOrderEmailConfig(env);
  const { subject, text, html } = buildEmailContent(order, kind);

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.from,
      to: [order.customer.email],
      reply_to: config.replyTo,
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new OrderEmailSendError(responseText || 'Resend rejected the order email.');
  }
}

async function sendOrderEmail(env: RuntimeEnv, order: OrderRecord, kind: OrderEmailKind) {
  if (!isEmail(order.customer.email)) {
    throw new OrderEmailSendError('Customer email address is missing or invalid.');
  }

  await sendWithResend(env, order, kind);
}

function addTimelineEntry(order: OrderRecord, label: string, status: string) {
  return [
    {
      label,
      at: new Date().toISOString(),
      status,
    },
    ...order.timeline,
  ].slice(0, 50);
}

function normaliseEmailError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown email error';
  return message.trim().slice(0, 500) || 'Unknown email error';
}

async function sendReceivedOrderEmailInternal(env: RuntimeEnv, reference: string, force: boolean) {
  const order = await getOrderByReference(env, reference);

  if (!order || (!force && order.receivedEmailSentAt)) {
    return { order, sent: Boolean(order?.receivedEmailSentAt), error: null as string | null };
  }

  try {
    await sendOrderEmail(env, order, 'received');
    const nextOrder: OrderRecord = {
      ...order,
      updatedAt: new Date().toISOString(),
      receivedEmailSentAt: new Date().toISOString(),
      receivedEmailFailedAt: undefined,
      receivedEmailError: undefined,
      timeline: addTimelineEntry(order, 'Received order email sent', 'EMAIL_SENT'),
    };
    await saveOrderRecord(env, nextOrder);
    return { order: nextOrder, sent: true, error: null as string | null };
  } catch (error) {
    const message = normaliseEmailError(error);
    const nextOrder: OrderRecord = {
      ...order,
      updatedAt: new Date().toISOString(),
      receivedEmailFailedAt: new Date().toISOString(),
      receivedEmailError: message,
      timeline: addTimelineEntry(order, 'Received order email failed', 'EMAIL_FAILED'),
    };
    await saveOrderRecord(env, nextOrder);
    return {
      order: nextOrder,
      sent: false,
      error: message,
    };
  }
}

async function sendAcceptedOrderEmailInternal(env: RuntimeEnv, reference: string, force: boolean) {
  const order = await getOrderByReference(env, reference);

  if (!order) {
    return { order: null, accepted: false, emailSent: false, error: 'missing' as const };
  }

  const alreadyAccepted = Boolean(order.acceptedAt || order.acceptedEmailSentAt || order.orderStatus === 'ACCEPTED');
  const acceptedAt = order.acceptedAt || new Date().toISOString();
  const acceptedOrder: OrderRecord = alreadyAccepted
    ? order
    : {
        ...order,
        acceptedAt,
        orderStatus: 'ACCEPTED',
        updatedAt: new Date().toISOString(),
        statusLabel: 'Accepted',
        timeline: addTimelineEntry(order, 'Order accepted by admin', 'ACCEPTED'),
      };

  if (!alreadyAccepted) {
    await saveOrderRecord(env, acceptedOrder);
  }

  if (!force && acceptedOrder.acceptedEmailSentAt) {
    return { order: acceptedOrder, accepted: true, emailSent: true, error: null as string | null };
  }

  try {
    await sendOrderEmail(env, acceptedOrder, 'accepted');
    const emailedOrder: OrderRecord = {
      ...acceptedOrder,
      updatedAt: new Date().toISOString(),
      acceptedEmailSentAt: new Date().toISOString(),
      acceptedEmailFailedAt: undefined,
      acceptedEmailError: undefined,
      timeline: addTimelineEntry(acceptedOrder, 'Accepted order email sent', 'EMAIL_SENT'),
    };
    await saveOrderRecord(env, emailedOrder);
    return { order: emailedOrder, accepted: true, emailSent: true, error: null as string | null };
  } catch (error) {
    const message = normaliseEmailError(error);
    const failedOrder: OrderRecord = {
      ...acceptedOrder,
      updatedAt: new Date().toISOString(),
      acceptedEmailFailedAt: new Date().toISOString(),
      acceptedEmailError: message,
      timeline: addTimelineEntry(acceptedOrder, 'Accepted order email failed', 'EMAIL_FAILED'),
    };
    await saveOrderRecord(env, failedOrder);
    return {
      order: failedOrder,
      accepted: true,
      emailSent: false,
      error: message,
    };
  }
}

export async function sendReceivedOrderEmail(env: RuntimeEnv, reference: string) {
  return sendReceivedOrderEmailInternal(env, reference, false);
}

export async function resendReceivedOrderEmail(env: RuntimeEnv, reference: string) {
  return sendReceivedOrderEmailInternal(env, reference, true);
}

export async function acceptOrderAndSendEmail(env: RuntimeEnv, reference: string) {
  return sendAcceptedOrderEmailInternal(env, reference, false);
}

export async function resendAcceptedOrderEmail(env: RuntimeEnv, reference: string) {
  return sendAcceptedOrderEmailInternal(env, reference, true);
}
