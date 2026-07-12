export const routes = {
  adminDashboard: '/admin',
  adminOrders: '/admin/orders',
  adminCustomers: '/admin/customers',
  adminOnlineStore: '/admin/online-store',
  adminOnlineStoreNew: '/admin/online-store/new',
  adminAvailability: '/admin/availability',
  adminPos: '/admin/pos',
  adminImages: '/admin/images',
  adminSettings: '/admin/settings',
  adminOrderDetail(reference: string) {
    return `/admin/orders/${encodeURIComponent(reference)}`;
  },
  adminCustomerDetail(email: string) {
    return `/admin/customers/${encodeURIComponent(email)}`;
  },
  adminOnlineStoreProduct(slug: string) {
    return `/admin/online-store/${encodeURIComponent(slug)}`;
  },
  adminLogin: '/admin/login',
  adminLogout: '/admin/logout',
  account: '/account',
  accountSignUp: '/account/sign-up',
  accountSignIn: '/account/sign-in',
  accountForgotPassword: '/account/forgot-password',
  accountResetPassword: '/account/reset-password',
  accountVerify: '/account/verify',
  accountLoyalty: '/account/loyalty',
  accountOrders: '/account/orders',
  accountOrderDetail(reference: string) {
    return `/account/orders/${encodeURIComponent(reference)}`;
  },
};
