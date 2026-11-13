# Healthwise v2 — disposable PostgreSQL known-session recovery integration

**Engineering Vault: NO-GO. Development branch only.**

## Implemented — 2026-11-13
- Added `rebuild/test/postgres-known-session-recovery.mjs`, which creates a unique temporary PostgreSQL schema and applies the existing design-only foundation and attempt-journal migrations.
- Uses four synthetic pending orders with v2 sandbox Price IDs and a simulated Stripe account/balance/session/line-item client. The test makes **no calls to Stripe** and never connects to Replit.
- Checks verified read-only recovery, same-session idempotency, rejection of wrong account, live-mode balance, wrong Price ID and provider outage, and manual handling of completed sessions.
- Exercises two concurrent recovery requests with different session IDs, requiring only one winner.
- Injects an error during the attempt-journal UPDATE using a temporary PostgreSQL trigger and verifies that the order UPDATE is rolled back in the same transaction.
- Added the script to the existing disposable PostgreSQL GitHub Actions integration job; no new infrastructure created.

## Verification limits
- GitHub connector's commit-to-workflow lookup has not returned a qualifying CI run for the latest commits; do not report a pass before independently verifying run status and logs.
- This is **not authenticated live Stripe validation**. The provider is a controlled offline stub, and only the PostgreSQL behavior is exercised in the integration test.
- The code recovers **known** session IDs only. Discovering a session successfully created by Stripe whose response was lost, along with safe expiration/manual review, remains an unresolved blocker.
- The attempt journal is not production-migrated. The v2 products/prices remain inactive; the legacy sandbox Replit webhook remains disabled. No public Checkout route is mounted.
- Production backup/PITR, authenticated end-to-end payment/webhook testing, refund/operations procedures and explicit release approval remain NO-GO gates.
