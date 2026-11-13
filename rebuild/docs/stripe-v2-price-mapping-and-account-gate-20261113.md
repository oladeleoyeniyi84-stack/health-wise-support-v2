# Healthwise v2 — sandbox price mapping and protected account check (2026-11-13)

**Release: ENGINEERING VAULT — NO-GO.** No Checkout, event endpoint, database migration, live payment or deployment was activated.

## Changes
- `rebuild/src/integrations/stripe-v2-catalog.mjs` contains the *new*, separately created inactive Healthwise v2 sandbox Product/Price IDs. These are public Stripe object identifiers, not secrets. Legacy IDs are not accepted.
- `getVerifiedV2SandboxSelection` fails closed unless the caller provides `livemode=false`, the exact expected sandbox account `acct_1T36fzDSAM5aSpF4`, and one of quick/full/premium. This function is pure; **caller-provided account identity must still be validated against the Stripe API** and must never be taken from an untrusted request.
- `rebuild/test/stripe-v2-catalog.test.mjs` checks mapping, amount, currency, unique IDs, and mismatch / prototype-key rejection.
- Protected manual workflow `.github/workflows/healthwise-stripe-protected-readiness.yml` now includes read-only `GET /v1/account` and compares the returned account ID against the expected sandbox ID. It fails closed without exposing account payloads or secrets.
- The preceding read-only balance check still requires `livemode=false`.
- The protected workflow does **not** run automatically: it requires development branch selection, `READ_ONLY_STRIPE_TEST_AUTH` acknowledgement, and founder approval of `healthwise-stripe-testmode`.

## Limits and remaining work
- The modified manual workflow has **not yet been independently run and approved**, so the GitHub-protected test key's exact sandbox-account match remains unverified.
- The v2 Stripe products/prices remain `active=false`; do not attempt real Checkout creation until explicitly approved for a limited sandbox experiment.
- No public checkout route or webhook endpoint is mounted. Future reconciliation must use a separate signed endpoint, raw-body signature validation, deduplication, retry and durable order state.
- Existing Replit webhook in this Stripe sandbox was independently confirmed `disabled`; separate Replit account billing, live-mode integrations and Calendly coupling remain outside the scope of this verification.
- Production restore/PITR, migration rehearsal, operational monitoring and release authorization remain blockers.
