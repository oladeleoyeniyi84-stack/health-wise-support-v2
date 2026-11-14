# Healthwise v2 — Checkout preparation atomic monetary guard (2026-11-14)

**Engineering Vault: NO-GO.** No Stripe writes, activation, production migration, Replit activity, or release.

## Verified evidence before this change
- GitHub CI run 43613001135 at 8108de0 independently passed 174/174 unit tests, disposable PostgreSQL integration, synthetic backup/restore and offline Stripe SDK.
- Connected Stripe sandbox account acct_1T36fzDSAM5aSpF4 was read without modification. Three new v2 prices remain inactive ($49, $99, $199), and the legacy Replit webhook remains disabled.
- CI status for the newer Checkout-preparation commits and these latest commits has not been independently established; never inherit 174/174 from the earlier run.

## Gap and correction
The original Checkout preparation module authenticated the provider account and matched the stored order to a pinned Price ID/amount/currency. But the earlier generic attempt reservation primitive only repeated status, session and Price ID checks in its conditional INSERT. Concurrent changes to stored amount, currency or consultation tier between the preflight and INSERT were not prevented by that INSERT.

Implemented `rebuild/src/integrations/stripe-v2-verified-attempt-reservation.mjs`: a v2-specific conditional PostgreSQL INSERT that atomically requires **order ID, Price ID, amount_minor, currency, consultation_key, pending status and unbound session** to match the previously verified values. On a conflict, reads order and journal together and accepts an idempotent retry only if all immutable fields and the original idempotency key still match. It never creates a Stripe Checkout session.

`rebuild/src/integrations/stripe-v2-checkout-preparation.mjs` now uses the strict reservation. Both the existing preparation test fixture and new `rebuild/test/stripe-v2-verified-attempt-reservation.test.mjs` cover changed amounts/currency/tier, wrong key, missing journal and malformed input.

## Remaining gates
1. Independently verify the current GitHub CI job outcome, including the new unit tests.
2. Exercise the strict reservation against a disposable PostgreSQL service under concurrent changes to amount, currency, tier and order status.
3. Checkout creation stays disconnected; inactive sandbox prices must keep blocking the read-only preflight. A prepared receipt is **not** proof that a payment should be created.
4. Future release work still requires production backup/PITR isolated restore, migration/rollback, provider-failure controls, Stripe signed webhook and settlement verification, operational alerting, refund controls and explicit public release approval.
