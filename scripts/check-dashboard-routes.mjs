import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const requiredRoutes = [
  'src/pages/admin/index.astro',
  'src/pages/admin/orders.astro',
  'src/pages/admin/products.astro',
  'src/pages/admin/customers/index.astro',
  'src/pages/admin/online-store/index.astro',
  'src/pages/admin/online-store/templates.astro',
  'src/pages/admin/online-store/editor.astro',
  'src/pages/admin/online-store/pages.astro',
  'src/pages/admin/online-store/pages/new.astro',
  'src/pages/admin/online-store/pages/[pageId].astro',
  'src/pages/admin/online-store/navigation.astro',
  'src/pages/admin/online-store/branding.astro',
  'src/pages/admin/pos.astro',
  'src/pages/admin/marketing.astro',
  'src/pages/admin/analytics.astro',
  'src/pages/admin/staff.astro',
  'src/pages/admin/settings.astro',
  'src/pages/admin/settings/store.astro',
  'src/pages/admin/settings/fulfilment.astro',
  'src/pages/admin/settings/notifications.astro',
  'src/pages/admin/settings/domains.astro',
  'src/pages/admin/billing.astro',
  'src/pages/admin/[...path].astro',
  'src/pages/owner/index.astro',
  'src/pages/owner/stores/index.astro',
  'src/pages/owner/stores/[storeId].astro',
  'src/pages/owner/merchants.astro',
  'src/pages/owner/billing.astro',
  'src/pages/owner/support.astro',
  'src/pages/owner/audit.astro',
  'src/pages/owner/platform-settings.astro',
  'src/pages/owner/[...path].astro',
  'src/pages/preview/[token].astro',
  'src/pages/store/[slug].astro',
];

const forbiddenDashboardPatterns = [
  /AdminShell/,
  /href=["']\/products/,
  /href=["']\/cart/,
  /href=["']\/contact/,
  /The Crumb Works/i,
  /Crumb Works/i,
  /bakery/i,
];

function walk(dir) {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const missing = requiredRoutes.filter((route) => !existsSync(join(root, route)));
if (missing.length) {
  console.error(`Missing dashboard routes:\n${missing.join('\n')}`);
  process.exit(1);
}

const dashboardFiles = [...walk(join(root, 'src/pages/admin')), ...walk(join(root, 'src/pages/owner')), join(root, 'src/layouts/MerchantAdminLayout.astro'), join(root, 'src/layouts/OwnerAdminLayout.astro')];
const violations = [];
for (const file of dashboardFiles) {
  const content = readFileSync(file, 'utf8');
  for (const pattern of forbiddenDashboardPatterns) {
    if (pattern.test(content)) violations.push(`${file}: ${pattern}`);
  }
}

if (violations.length) {
  console.error(`Dashboard route audit failed:\n${violations.join('\n')}`);
  process.exit(1);
}

console.log('Dashboard route audit passed.');
