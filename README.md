# White-Label Commerce Foundation

This repository is a white-label copy of a verified production baseline, isolated for safe reuse and Phase 1 extraction work.

**This repository must never be connected to The Crumb Works production domain, infrastructure, data stores, secrets, merchant configuration or deployment targets.**

## Architecture

- Storefront pages, catalogue, cart, checkout, and customer-facing routes live under `src/pages`.
- Admin CMS routes live under `src/pages/admin`.
- Authentication and session logic live in `src/lib/adminAuth.ts` and the customer account modules.
- Orders, loyalty, storage, email, and payment integrations remain in their existing server-side modules.
- Public brand-facing defaults now live in [`src/config/business.ts`](./src/config/business.ts).

More detail is in [`docs/architecture.md`](./docs/architecture.md).

## Local setup

```sh
npm install
cp .env.example .env
npm run validate:env
npm run check
npm run build
astro dev --background
astro dev status
```

Manage the background dev server with:

```sh
astro dev logs
astro dev stop
```

Generate admin credentials locally when needed:

```sh
node scripts/create-admin-credentials.mjs
```

## Configuration

Public business identity and theme defaults are centralised in [`src/config/business.ts`](./src/config/business.ts).

Environment placeholders are documented in [`.env.example`](./.env.example). Keep secrets out of Git.

Key server-side integrations:

- `WEB3FORMS_ACCESS_KEY` for contact form delivery
- `SUMUP_API_KEY` and `SUMUP_MERCHANT_CODE` for checkout
- `RESEND_API_KEY`, `ORDER_EMAIL_FROM`, and optional `ORDER_EMAIL_REPLY_TO` for email sending
- `POS_INGEST_SECRET` and `POS_ALLOWED_ORIGIN` for POS integration
- `ADMIN_EMAIL_ALLOWLIST`, `ADMIN_PASSWORD_HASH`, and `ADMIN_SESSION_SECRET` for admin access

## Deployment safety

- `wrangler.jsonc` uses the neutral worker name `white-label-commerce-preview`.
- `npm run check:safety` blocks known production identifiers in active config files and relevant environment values.
- `npm run guard:deploy` requires `WHITE_LABEL_PROJECT_CONFIRMED=true` and reruns the prohibited-identifier guard before any deployment command.
- Missing secret configuration is expected locally; checkout, email, and admin features fail safely when the required secrets are absent.

## Audit

The Phase 1 business-coupling audit is tracked in [`docs/white-label-audit.md`](./docs/white-label-audit.md).
