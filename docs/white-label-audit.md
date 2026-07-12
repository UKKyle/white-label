# White-Label Audit

This audit records the most important business-specific dependencies found in the verified production baseline copied into this repository for Phase 1.

| File or location | Current business-specific dependency | Category | Risk level | Recommended configuration destination | Recommended phase | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `wrangler.jsonc` | Worker name `bakedbymadyv2` | Deployment target | Critical | `wrangler.jsonc` neutral name plus deploy guard | Phase 1 | Resolved |
| `src/middleware.ts` | Hardcoded Crumb Works canonical and redirect hosts | Domain and trusted origin | Critical | `src/config/business.ts` | Phase 1 | Resolved |
| `README.md` | Production-flavoured deploy guidance and merchant wording | Documentation safety | High | `README.md` | Phase 1 | Resolved |
| `src/config/business.ts` | Neutral business defaults required for new brands | Public identity | High | `src/config/business.ts` | Phase 1 | Resolved |
| `src/layouts/Layout.astro` | No central favicon, canonical, or org schema source | SEO and metadata | High | `src/config/business.ts` | Phase 1 | Resolved |
| `src/components/Header.astro` | Hardcoded brand logo and Crumb Works labels | Header identity | Medium | `src/config/business.ts` | Phase 1 | Resolved |
| `src/components/Footer.astro` | Hardcoded footer logo, blurb, and support email | Footer identity | Medium | `src/config/business.ts` | Phase 1 | Resolved |
| `src/components/TermsAcceptanceModal.astro` | Hardcoded logo path, storage key fallback, and business name | Public legal chrome | Medium | `src/config/business.ts` | Phase 1 | Resolved |
| `src/components/TermsContent.astro` | The Crumb Works legal wording across bakery-specific terms | Legal content | High | CMS or legal content config | Phase 2 | Deferred |
| `src/pages/privacy.astro` | The Crumb Works privacy text | Legal content | High | CMS or legal content config | Phase 2 | Deferred |
| `src/pages/terms.astro` | Bakery-specific terms title and body | Legal content | High | CMS or legal content config | Phase 2 | Deferred |
| `src/pages/allergen-information.astro` | Bakery-specific allergen process and kitchen wording | Product/legal | High | Product/legal content config | Phase 2 | Deferred |
| `src/pages/contact.astro` | WhatsApp link and business-name copy in enquiry UI | Public contact links | Medium | `src/config/business.ts` | Phase 1 | Resolved |
| `src/pages/about.astro` | Birmingham and bakery-specific positioning copy | Marketing content | Medium | CMS-managed content | Phase 2 | Deferred |
| `src/data/site.ts` | Static trust points, testimonials, FAQs, and starter products | Seed content | Medium | `src/config/business.ts` and CMS | Phase 2 | Deferred |
| `src/lib/orderEmails.ts` | Hardcoded email logo URL, contact email, and Crumb Works copy | Email sending | Critical | Server email config plus templates | Phase 2 | Deferred |
| `src/lib/customerAccountEmails.ts` | Hardcoded support contact and brand copy | Email sending | High | Server email config plus templates | Phase 2 | Deferred |
| `src/pages/api/contact.ts` | Subject and sender labels tied to Crumb Works | Email sending | High | `src/config/business.ts` | Phase 2 | Deferred |
| `src/pages/api/checkout/session.ts` | Order description text and fallback reference prefix `bbm` | Payments and order refs | High | `src/config/business.ts` | Phase 2 | Deferred |
| `src/lib/productStore.ts` | Brand fallback product image path | Fallback branding | Medium | `src/config/business.ts` | Phase 1 | Resolved |
| `src/lib/managedImages.ts` | Brand fallback logo and alt text | Fallback branding | Medium | `src/config/business.ts` | Phase 1 | Resolved |
| `public/scripts/cart.js` | Storage keys and customer messages mention Crumb Works | Browser storage and UX copy | Medium | Public config or CMS copy | Phase 2 | Deferred |
| `src/components/admin/AdminShell.astro` | Admin header brand label | Admin identity | Medium | `src/config/business.ts` | Phase 1 | Resolved |
| `src/pages/cookies-policy.astro` | Cookie provider and contact email mention Crumb Works | Legal content | Medium | `src/config/business.ts` plus legal content source | Phase 1 | Resolved |
| `SumUp and Resend environment variables` | Merchant and sender configuration must never reuse live values | Payments and email infra | Critical | Environment-only secrets | Phase 1 | Resolved |

## Summary

- Critical dependencies: 5
- High-risk dependencies: 7
- Medium-risk dependencies: 13
- Low-risk dependencies: 0
- Resolved items: 12
- Deferred items: 13

## Deferred Phase 2 focus

- Replace bakery-specific legal and allergy copy with configurable legal content.
- Extract email templates, sender naming, and checkout copy into safer config/template layers.
- Genericise product schema, homepage seed content, and loyalty/product wording without regressing checkout.
- Move remaining customer-facing copy from hardcoded pages into CMS or a dedicated content configuration system.
