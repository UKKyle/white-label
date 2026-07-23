export type PlatformNavItem = {
  label: string;
  href: string;
  description?: string;
  permission?: string;
};

export const merchantNavigation: PlatformNavItem[] = [
  { label: 'Home', href: '/admin', description: 'Store overview and setup progress' },
  { label: 'Orders', href: '/admin/orders', description: 'Order management' },
  { label: 'Products', href: '/admin/products', description: 'Store catalogue' },
  { label: 'Customers', href: '/admin/customers', description: 'Customer records' },
  { label: 'Online Store', href: '/admin/online-store', description: 'Storefront setup and publishing' },
  { label: 'POS', href: '/admin/pos', description: 'Point of sale setup' },
  { label: 'Marketing', href: '/admin/marketing', description: 'Campaigns, discounts and segments' },
  { label: 'Analytics', href: '/admin/analytics', description: 'Store performance' },
  { label: 'Staff', href: '/admin/staff', description: 'Store team and roles' },
  { label: 'Settings', href: '/admin/settings', description: 'Store configuration' },
  { label: 'Billing', href: '/admin/billing', description: 'Plan and billing status' },
];

export const merchantOnlineStoreNavigation: PlatformNavItem[] = [
  { label: 'Store home', href: '/admin/online-store', description: 'Storefront overview' },
  { label: 'Builder', href: '/admin/online-store/editor', description: 'Visual storefront editor' },
  { label: 'Pages', href: '/admin/online-store/pages', description: 'Storefront pages' },
  { label: 'Navigation', href: '/admin/online-store/navigation', description: 'Customer menus' },
  { label: 'Design', href: '/admin/online-store/branding', description: 'Colours and typography' },
  { label: 'Templates', href: '/admin/online-store/templates', description: 'Storefront templates' },
];

export const merchantSettingsNavigation: PlatformNavItem[] = [
  { label: 'Overview', href: '/admin/settings' },
  { label: 'Store details', href: '/admin/settings/store' },
  { label: 'Fulfilment', href: '/admin/settings/fulfilment' },
  { label: 'Notifications', href: '/admin/settings/notifications' },
  { label: 'Domains', href: '/admin/settings/domains' },
  { label: 'Staff', href: '/admin/staff' },
  { label: 'Billing', href: '/admin/billing' },
];

export const ownerNavigation: PlatformNavItem[] = [
  { label: 'Overview', href: '/owner', description: 'Platform health and activity' },
  { label: 'Stores', href: '/owner/stores', description: 'Manage all stores' },
  { label: 'Merchants', href: '/owner/merchants', description: 'Merchant users and memberships' },
  { label: 'Billing', href: '/owner/billing', description: 'Plans and payment states' },
  { label: 'Support', href: '/owner/support', description: 'Store support workspace' },
  { label: 'Audit', href: '/owner/audit', description: 'Administrative event log' },
  { label: 'Platform settings', href: '/owner/platform-settings', description: 'Platform defaults and controls' },
];

export function isActivePath(pathname: string, href: string) {
  const current = pathname.replace(/\/$/, '') || '/';
  if (href === '/admin' || href === '/owner') return current === href;
  return current === href || current.startsWith(`${href}/`);
}
