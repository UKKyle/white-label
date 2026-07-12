import type { APIRoute } from 'astro';
import { getCsrfCookieName, isValidCsrf } from '../../security/csrf';
import { checkRateLimit, requestKey } from '../../security/rate-limit';
import { isEmail, sanitizeEmail, sanitizeText } from '../../security/sanitize';

export const POST: APIRoute = async ({ request, cookies }) => {
  const formData = await request.formData();
  const csrfToken = sanitizeText(formData.get('csrfToken'));
  const cookieToken = cookies.get(getCsrfCookieName())?.value;

  if (!isValidCsrf(request, cookieToken, csrfToken)) {
    return Response.json({ message: 'Security validation failed.' }, { status: 403 });
  }

  if (!checkRateLimit(requestKey(request), 8, 60_000)) {
    return Response.json({ message: 'Too many signup attempts. Please try again later.' }, { status: 429 });
  }

  const email = sanitizeEmail(formData.get('email'));

  if (!isEmail(email)) {
    return Response.json({ message: 'Please enter a valid email address.' }, { status: 400 });
  }

  return Response.json({ message: `Thanks. ${email} has been added to our mailing list.` });
};
