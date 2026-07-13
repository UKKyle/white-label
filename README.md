# White Label

White Label is a tenant-scoped commerce administration platform. It is not a storefront template and contains no active merchant catalogue or demo store data.

## Routes

- `/` platform entry
- `/create-account` creates a blank merchant, store, membership and settings record
- `/login` merchant access
- `/owner/login` platform-owner access, protected by the existing admin/TOTP credentials
- `/owner` platform management
- `/admin` merchant workspace

## Tenant rules

All store-owned records use a `storeId`. The server resolves access from the signed-in session, validates active membership, and does not trust store IDs supplied by the browser. KV keys are namespaced under `wl:v1` and use opaque UUIDs.

The current first release provides the platform, tenant, blank CMS/POS and billing-status foundations. Products, orders, customers, assets and storefront rendering are intentionally unavailable until each is migrated to store-scoped services.

## Required secrets

`ADMIN_EMAIL`, `ADMIN_PASSWORD` (temporary compatibility), `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, and `ADMIN_TOTP_SECRET` are used only for the platform-owner bootstrap login. Never commit them. Merchant credentials are hashed and stored in the configured KV binding.

## Checks

```sh
npm install
npm run check:safety
npm run check
npm run build
```
