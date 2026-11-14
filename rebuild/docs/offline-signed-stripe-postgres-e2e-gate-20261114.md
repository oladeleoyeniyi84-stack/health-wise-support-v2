# Healthwise v2 — Offline signed Checkout-to-PostgreSQL integration gate

**2026-11-14. Engineering Vault: NO-GO.**

## Verified baseline
Run `43615034287` at commit `5c3f656` passed 189/189 unit tests, all four jobs, including disposable PostgreSQL monetary reservation and offline Stripe SDK. Latest screenshot also showed a successful build for signed-webhook tests at commit `945c788`. These results do not by themselves certify this new integration test.

## New integration
- Added `rebuild/test/postgres-signed-stripe-e2e.mjs`.
- Creates a synthetic test Checkout session and paid event **in memory**, signs it using the **real Stripe SDK** and an **offline fixture signing secret**; there are no calls to Stripe APIs.
- Applies design-only foundation SQL solely in a temporary schema of the explicit disposable PostgreSQL CI service. Uses the real `createEventRepository` adapter and `processSignedSandboxReconciliation` function to exercise the signature, provider line item verification, event deduplication, order transition and entitlement creation across actual PostgreSQL transactions.
- Asserts tampered signatures are rejected before provider access; provider outage preserves pending status and zero events; concurrent duplicate deliveries produce one `mark_paid`, one `duplicate` and one pending entitlement; a distinct event ID for the paid order returns `ignore` and does not issue another entitlement.
- Drops the temporary schema on completion. Requires localhost-only disposable DB safety gate and `YES_DISPOSABLE_DB` acknowledgment.
- Updated `.github/workflows/healthwise-rebuild-tests.yml` so the PostgreSQL CI job installs ephemeral `pg` and `stripe` SDKs, then runs the new integration script.

## Critical limitations and next gate
- All Checkout, payment, session, and webhook values in this test are **synthetic**. This is *not* a real test-mode Stripe Checkout or provider-hosted webhook delivery; no actual Stripe objects were created.
- The three dedicated v2 prices remain inactive and their activation is **not approved** by this change.
- No public payment route or external webhook endpoint is wired. No production migration, production PITR restore or deployment occurred.
- CI on the new commit must be independently inspected; previous successful runs are not evidence that this new test passed.
- After CI is green, prepare a separate decision package for explicit authorization to activate sandbox-only v2 prices and run a bounded real test-mode Checkout and webhook delivery in an isolated infrastructure environment, with rollback/deactivation, idempotency and refund/dispute controls. Live activation/public release remains a separate approval.
