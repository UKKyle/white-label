import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const activeFiles = [
  'wrangler.jsonc',
  '.env',
  '.env.local',
  '.env.production',
  '.env.preview',
  '.env.development',
  '.dev.vars',
  'package.json',
];

const prohibitedPatterns = [
  /thecrumbworks\.co\.uk/i,
  /www\.thecrumbworks\.co\.uk/i,
  /thecrumbworks\.com/i,
  /crumbworks\.co\.uk/i,
  /\bbakedbymadyv2\b/i,
];

const relevantEnvNames = [
  'PUBLIC_SITE_URL',
  'POS_ALLOWED_ORIGIN',
  'ORDER_EMAIL_FROM',
  'ORDER_EMAIL_REPLY_TO',
  'SUMUP_MERCHANT_CODE',
  'WHITE_LABEL_PROJECT_CONFIRMED',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_PROJECT_NAME',
];

const violations = [];

for (const relativePath of activeFiles) {
  const absolutePath = path.join(cwd, relativePath);
  if (!fs.existsSync(absolutePath)) continue;

  const content = fs.readFileSync(absolutePath, 'utf8');
  for (const pattern of prohibitedPatterns) {
    if (pattern.test(content)) {
      violations.push(`${relativePath} matched ${pattern}`);
    }
  }
}

for (const envName of relevantEnvNames) {
  const value = process.env[envName];
  if (!value) continue;

  for (const pattern of prohibitedPatterns) {
    if (pattern.test(value)) {
      violations.push(`process.env.${envName} matched ${pattern}`);
    }
  }
}

if (violations.length > 0) {
  console.error('White-label safety check failed. Prohibited production identifiers were found in active configuration.');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('White-label safety check passed.');
