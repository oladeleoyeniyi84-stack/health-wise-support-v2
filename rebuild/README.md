# Healthwise Support — clean rebuild foundation

Status: **engineering-only / NO-GO for public release**. This branch does not replace, deploy, migrate, or modify the existing service. Existing data, payments and Calendly bookings remain authoritative until verified.

## Boundaries
- Separate source and data ownership; do not connect the Elevate360BrandHub production database.
- No Replit dependency, no new paid Render service, no live Stripe charge, no Calendly mutation.
- Do not claim licensed clinicians, 24/7 service, emergency response, testimonials, or metrics without verifiable evidence.
- Wellness information is not emergency care or individualized medical diagnosis.
- Engineering Vault stays active; no marketing or availability changes.

## MVP sequence
1. Define consultation catalog and pricing from **verified** Stripe/Calendly configuration (not hard-coded historical assumptions).
2. Build public informational pages and accessible consultation selection.
3. Build server-side checkout/session creation with verified Stripe price IDs, ownership binding and idempotency.
4. Validate signed Stripe webhooks and persist minimal booking/payment state in a **new isolated database**.
5. Verify authenticated access, cross-account authorization, data retention, privacy and abuse controls.
6. Reconcile existing orders and booking entitlements read-only before any migration.
7. Run isolated restore, migration rehearsal, provider sandbox tests, dependency audit, and release gates.

## Existing repository warning
The default branch's package.json references `server/index.ts`, which was not found in the GitHub source audit. Treat it as an incomplete legacy reference; do not build on it blindly.

## First executable artifact
`src/domain/consultations.mjs` implements a dependency-free, fail-closed consultation catalog parser and its Node test suite. No network calls or secrets are required.
