export type PlatformRole = 'platform_owner' | 'store_owner' | 'store_admin' | 'store_staff';
export type UserStatus = 'active' | 'pending' | 'suspended';
export type StoreStatus = 'trial' | 'active' | 'payment_due' | 'past_due' | 'suspended' | 'cancelled';

export interface PlatformUser {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string;
  platformRole?: 'platform_owner';
  status: UserStatus;
  emailVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface Store {
  id: string;
  name: string;
  slug: string;
  status: StoreStatus;
  ownerUserId: string;
  businessCategory: string;
  contactEmail: string;
  contactPhone: string;
  billingStatus: StoreStatus;
  plan: 'starter' | 'standard' | 'custom';
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
}

export interface StoreMembership {
  id: string;
  storeId: string;
  userId: string;
  role: Exclude<PlatformRole, 'platform_owner'>;
  status: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

export interface StoreSettings {
  storeId: string;
  currency: string;
  timezone: string;
  businessAddress: string;
  orderSettings: Record<string, never>;
  taxSettings: Record<string, never>;
  fulfilmentSettings: Record<string, never>;
  brandingSettings: Record<string, never>;
  domainSettings: Record<string, never>;
  checkoutSettings: Record<string, never>;
  notificationSettings: Record<string, never>;
}

export interface AuditLog {
  id: string;
  actorUserId: string;
  actorRole: PlatformRole;
  storeId?: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, string>;
  createdAt: string;
}

export type PlatformSession = {
  userId: string;
  role: PlatformRole;
  storeId?: string;
  expiresAt: number;
};
