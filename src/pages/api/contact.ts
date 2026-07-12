import type { APIRoute } from 'astro';
import { isPlainDateString, isUnavailableDate } from '../../lib/availabilityStore';
import { getAdapterEnv } from '../../lib/runtimeEnv';
import { getCsrfCookieName, isValidCsrf } from '../../security/csrf';
import { checkRateLimit, requestKey } from '../../security/rate-limit';
import { isEmail, sanitizeEmail, sanitizeText } from '../../security/sanitize';

const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit';

export const prerender = false;

interface Web3FormsResponse {
  success?: boolean;
  message?: string;
}

function json(message: string, status = 200) {
  return Response.json({ message }, { status });
}

function parseWeb3FormsResponse(text: string) {
  if (!text) return null;

  try {
    return JSON.parse(text) as Web3FormsResponse;
  } catch {
    return null;
  }
}

function getWeb3FormsAccessKey(locals: unknown) {
  const value = getAdapterEnv({ locals }).WEB3FORMS_ACCESS_KEY;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getSourceUrl(request: Request) {
  const referer = request.headers.get('referer');

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const requestUrl = new URL(request.url);

      if (refererUrl.origin === requestUrl.origin) {
        return refererUrl.toString();
      }
    } catch {
      // Ignore malformed referers and fall back to the API request URL.
    }
  }

  return request.url;
}

async function sendWeb3FormsEnquiry({
  accessKey,
  request,
  name,
  email,
  phone,
  message,
  enquiryContext
}: {
  accessKey: string;
  request: Request;
  name: string;
  email: string;
  phone: string;
  message: string;
  enquiryContext: string;
}) {
  const response = await fetch(WEB3FORMS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      access_key: accessKey,
      subject: `New Crumb Works enquiry from ${name}`,
      from_name: 'Crumb Works Website',
      name,
      email,
      phone: phone || 'Not provided',
      context: enquiryContext || 'Not provided',
      message,
      source_url: getSourceUrl(request),
      submitted_at: new Date().toISOString()
    })
  });

  const responseText = await response.text();
  const result = parseWeb3FormsResponse(responseText);

  if (!response.ok || !result?.success) {
    throw new Error(result?.message || responseText || 'Web3Forms rejected the enquiry.');
  }
}

async function handleContactPost({ request, cookies, locals }: Parameters<APIRoute>[0]) {
  const formData = await request.formData();
  const csrfToken = sanitizeText(formData.get('csrfToken'));
  const cookieToken = cookies.get(getCsrfCookieName())?.value;
  const company = sanitizeText(formData.get('company'));

  if (!isValidCsrf(request, cookieToken, csrfToken)) {
    return json('Security validation failed.', 403);
  }

  if (company) {
    return json('Thanks. Your enquiry has been received.');
  }

  if (!checkRateLimit(requestKey(request), 5, 60_000)) {
    return json('Too many requests. Please try again shortly.', 429);
  }

  const name = sanitizeText(formData.get('name'));
  const email = sanitizeEmail(formData.get('email'));
  const phone = sanitizeText(formData.get('phone'));
  const message = sanitizeText(formData.get('message'));
  const enquiryContext = sanitizeText(formData.get('enquiryContext'));
  const requestedDate = sanitizeText(formData.get('requestedDate'));

  if (!name || !message || !isEmail(email)) {
    return json('Please provide a valid name, email, and message.', 400);
  }

  if (requestedDate && !isPlainDateString(requestedDate)) {
    return json('Please choose a valid requested date from the calendar.', 400);
  }

  if (requestedDate && await isUnavailableDate(getAdapterEnv({ locals }), requestedDate)) {
    return json('That requested date is currently unavailable. Please choose another date.', 400);
  }

  const accessKey = getWeb3FormsAccessKey(locals);

  if (!accessKey) {
    return json('Contact form is not configured yet.', 500);
  }

  try {
    await sendWeb3FormsEnquiry({
      accessKey,
      request,
      name,
      email,
      phone,
      message,
      enquiryContext: [enquiryContext, requestedDate ? `requestedDate: ${requestedDate}` : ''].filter(Boolean).join(' | ').slice(0, 1200)
    });
  } catch (error) {
    console.error('web3forms_contact_send_failed', {
      message: error instanceof Error ? error.message : 'Unknown Web3Forms error'
    });

    return json('Your message could not be sent right now. Please try again later.', 502);
  }

  return Response.json({
    message: `Thanks ${name}. We've received your enquiry and will be in touch soon.`
  });
}

export const POST: APIRoute = async (context) => {
  try {
    return await handleContactPost(context);
  } catch (error) {
    console.error('contact_route_unhandled_error', {
      message: error instanceof Error ? error.message : 'Unknown contact route error'
    });

    return json('Your message could not be sent right now. Please try again later.', 500);
  }
};
