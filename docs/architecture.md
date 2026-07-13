# White Label architecture

`PlatformUser`, `Store`, `StoreMembership`, `StoreSettings`, and `AuditLog` live in `src/types/platform.ts`. Tenant persistence lives in `src/lib/platform/store.ts`; it uses the Worker KV binding in production and a memory fallback locally.

Merchant registration atomically provisions a user, blank trial store, owner membership and neutral settings. Store IDs are generated server-side. A merchant session contains its resolved store context; `requireStoreMembership` validates that membership server-side before access. Platform-owner sessions are separate and can never be reached through merchant routes.

Billing is store state: `trial`, `active`, `payment_due`, `past_due`, `suspended`, or `cancelled`. Suspended and cancelled stores are rejected by the tenant access helper. Sensitive provisioning events are appended to an audit log.

No support impersonation exists. It must be implemented as an explicit, audited, time-bound mode rather than a session swap.

The legacy single-store storefront is retired by middleware. The next migration pass must add store-scoped product, order, customer, CMS, POS and asset services before enabling those merchant routes.
