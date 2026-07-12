# Architecture Notes

## Storefront

- Astro server-rendered storefront with Tailwind CSS.
- Public marketing pages, product catalogue, product pages, cart, and order confirmation live under `src/pages`.
- Shared visual primitives live in `src/components`.

## Admin CMS

- Admin routes live under `src/pages/admin`.
- Product, image, availability, order, and settings surfaces are preserved from the imported baseline.

## Authentication and Accounts

- Admin authentication is handled in `src/lib/adminAuth.ts`.
- Customer account flows, loyalty, and password/email verification remain in their existing modules and routes.

## Orders, Email, and Payments

- Checkout session creation remains in `src/pages/api/checkout/session.ts`.
- Order storage and lifecycle logic remain in `src/lib/orderStore.ts` and `src/lib/orderService.ts`.
- Resend and Web3Forms integrations remain server-side only.

## Storage and Deployment

- Cloudflare adapter configuration remains in Astro and Wrangler config.
- Deployment is protected by repository-level safety scripts and neutral defaults added in Phase 1.
