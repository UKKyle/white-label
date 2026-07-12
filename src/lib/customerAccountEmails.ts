import { brand } from '../data/site';
import type { RuntimeEnv } from './runtimeEnv';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const ACCOUNT_EMAIL_CONTACT = 'hello@thecrumbworks.co.uk';

type AccountEmailKind = 'verify' | 'reset';

export class CustomerAccountEmailError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'CustomerAccountEmailError';
    this.status = status;
  }
}

function getEmailConfig(env: RuntimeEnv) {
  const apiKey = typeof env.RESEND_API_KEY === 'string' ? env.RESEND_API_KEY.trim() : '';
  const from = typeof env.ORDER_EMAIL_FROM === 'string' ? env.ORDER_EMAIL_FROM.trim() : '';
  const replyTo = typeof env.ORDER_EMAIL_REPLY_TO === 'string' && env.ORDER_EMAIL_REPLY_TO.trim()
    ? env.ORDER_EMAIL_REPLY_TO.trim()
    : brand.email;

  if (!apiKey || !from) {
    throw new Error('Account email sending is not configured.');
  }

  return { apiKey, from, replyTo };
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildPublicUrl(env: RuntimeEnv, fallbackUrl: URL, path: string) {
  const origin = typeof env.PUBLIC_SITE_URL === 'string' && env.PUBLIC_SITE_URL.trim()
    ? env.PUBLIC_SITE_URL.trim().replace(/\/+$/, '')
    : fallbackUrl.origin;
  return `${origin}${path}`;
}

function buildHtml(heading: string, intro: string, href: string, button: string) {
  return `<!doctype html>
  <html>
    <body style="margin:0;padding:0;background:#ffd8e6;font-family:Arial,Helvetica,sans-serif;color:#3d2930;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#ffd8e6;">
        <tr>
          <td align="center" style="padding:28px 14px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;border-collapse:collapse;">
              <tr>
                <td style="background:#fff;border-radius:18px;padding:34px 28px;">
                  <h1 style="margin:0 0 16px;font-size:28px;line-height:34px;color:#3d2930;">${escapeHtml(heading)}</h1>
                  <p style="margin:0 0 22px;font-size:16px;line-height:24px;color:#5c3d48;">${escapeHtml(intro)}</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                    <tr>
                      <td style="border-radius:999px;background:#d94d7d;">
                        <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 20px;color:#fff;font-size:15px;line-height:18px;font-weight:700;text-decoration:none;">${escapeHtml(button)}</a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:22px 0 0;color:#8a5b6d;font-size:13px;line-height:20px;">If the button does not work, paste this link into your browser:<br />${escapeHtml(href)}</p>
                  <p style="margin:22px 0 0;color:#8a5b6d;font-size:13px;line-height:20px;">If you did not request this, you can ignore this email or contact ${ACCOUNT_EMAIL_CONTACT}.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
}

function buildCodeHtml(code: string) {
  return `<!doctype html>
  <html>
    <body style="margin:0;padding:0;background:#ffd8e6;font-family:Arial,Helvetica,sans-serif;color:#3d2930;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#ffd8e6;">
        <tr><td align="center" style="padding:28px 14px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;border-collapse:collapse;">
            <tr><td style="background:#fff;border-radius:18px;padding:34px 28px;">
              <h1 style="margin:0 0 16px;font-size:28px;line-height:34px;color:#3d2930;">Verify your The Crumb Works account</h1>
              <p style="margin:0 0 18px;font-size:16px;line-height:24px;color:#5c3d48;">Enter this code on the account verification page. It expires in 15 minutes and can only be used once.</p>
              <div style="margin:24px 0;padding:18px;border:1px solid #f3cbd9;border-radius:14px;background:#fff8fb;text-align:center;font-size:32px;letter-spacing:0.18em;font-weight:700;color:#3d2930;">${escapeHtml(code)}</div>
              <p style="margin:0;color:#8a5b6d;font-size:13px;line-height:20px;">If you did not request this, you can ignore this email or contact ${ACCOUNT_EMAIL_CONTACT}.</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
  </html>`;
}

async function sendAccountEmail(env: RuntimeEnv, requestUrl: URL, options: {
  to: string;
  token: string;
  kind: AccountEmailKind;
}) {
  const config = getEmailConfig(env);
  const path = options.kind === 'verify'
    ? `/account/verify?token=${encodeURIComponent(options.token)}`
    : `/account/reset-password?token=${encodeURIComponent(options.token)}`;
  const href = buildPublicUrl(env, requestUrl, path);
  const subject = options.kind === 'verify'
    ? 'Verify your The Crumb Works account'
    : 'Reset your The Crumb Works password';
  const intro = options.kind === 'verify'
    ? 'Please confirm your email address to access your account and order history.'
    : 'Use this secure link to choose a new password. The link expires shortly and can only be used once.';
  const button = options.kind === 'verify' ? 'Verify email' : 'Reset password';

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.from,
      to: [options.to],
      reply_to: config.replyTo,
      subject,
      text: `${intro}\n\n${href}\n\nIf you did not request this, ignore this email or contact ${ACCOUNT_EMAIL_CONTACT}.`,
      html: buildHtml(subject, intro, href, button),
    }),
  });

  if (!response.ok) {
    throw new CustomerAccountEmailError('Account email could not be sent.', response.status);
  }
}

export async function sendVerificationEmail(env: RuntimeEnv, _requestUrl: URL, email: string, token: string) {
  const config = getEmailConfig(env);
  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.from,
      to: [email],
      reply_to: config.replyTo,
      subject: 'Your The Crumb Works verification code',
      text: `Your The Crumb Works verification code is ${token}. It expires in 15 minutes and can only be used once.`,
      html: buildCodeHtml(token),
    }),
  });

  if (!response.ok) {
    throw new CustomerAccountEmailError('Account verification email could not be sent.', response.status);
  }
}

export async function sendPasswordResetEmail(env: RuntimeEnv, requestUrl: URL, email: string, token: string) {
  await sendAccountEmail(env, requestUrl, { to: email, token, kind: 'reset' });
}
