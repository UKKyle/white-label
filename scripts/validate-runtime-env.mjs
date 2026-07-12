const issues = [];

const isUrl = (value) => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const publicSiteUrl = process.env.PUBLIC_SITE_URL;
if (publicSiteUrl && !isUrl(publicSiteUrl)) {
  issues.push('PUBLIC_SITE_URL must be a valid absolute URL when set.');
}

const posAllowedOrigin = process.env.POS_ALLOWED_ORIGIN;
if (posAllowedOrigin && !isUrl(posAllowedOrigin)) {
  issues.push('POS_ALLOWED_ORIGIN must be a valid absolute origin when set.');
}

const sumupValues = ['SUMUP_API_KEY', 'SUMUP_MERCHANT_CODE'].filter((name) => Boolean(process.env[name]));
if (sumupValues.length === 1) {
  issues.push('SUMUP_API_KEY and SUMUP_MERCHANT_CODE must be provided together.');
}

const resendValues = ['RESEND_API_KEY', 'ORDER_EMAIL_FROM'].filter((name) => Boolean(process.env[name]));
if (resendValues.length === 1) {
  issues.push('RESEND_API_KEY and ORDER_EMAIL_FROM must be provided together.');
}

const adminValues = ['ADMIN_EMAIL_ALLOWLIST', 'ADMIN_PASSWORD_HASH', 'ADMIN_SESSION_SECRET'];
const presentAdminValues = adminValues.filter((name) => Boolean(process.env[name]));
if (presentAdminValues.length > 0 && presentAdminValues.length < adminValues.length) {
  issues.push('ADMIN_EMAIL_ALLOWLIST, ADMIN_PASSWORD_HASH, and ADMIN_SESSION_SECRET must be provided together.');
}

if (issues.length > 0) {
  console.error('Runtime environment validation failed:');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log('Runtime environment validation passed.');
