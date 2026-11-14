# Healthwise v2 — isolated Checkout preparation gate (2026-11-14)

**Engineering Vault: NO-GO. No Stripe writes or public release.**

## Baseline evidence
- Previous GitHub Actions run 43613001135 at commit 8108de0: 174/174 unit tests passed; all four CI jobs green. This result predates the latest Checkout preflight and preparation commits.
- The connected Healthwise sandbox was read directly: v2 quick $49, full $99, premium $199 prices remain inactive; the legacy Replit-targeting sandbox webhook remains disabled. Legacy prices were not modified.

## Added code
- `rebuild/src/integrations/stripe-v2-checkout-authorization.mjs` authenticates Stripe sandbox account and test-mode via read-only account/balance methods, then verifies the pinned catalog and that both product and price are active.
- `rebuild/src/integrations/stripe-v2-checkout-preparation.mjs` reads the pending order and its immutable local price/amount/currency context; it calls the read-only provider authorization gate and then atomically reserves the matching idempotency key in the durable Checkout attempt journal.
- The preparation method **contains no Stripe session creation call**, does not expose a Checkout URL, and returns only a `prepared_only` result. It is not mounted on the public server.
- `rebuild/test/stripe-v2-checkout-preparation.test.mjs` checks inactive-price refusal with zero DB writes, account and live-mode rejection, mismatched amount/price/status, idempotent reservation, and an order-state change after preflight.

## Mandatory remaining release gates
1. Independently verify CI on these newer commits; 174/174 is an earlier commit's result, not a new count.
2. A journal reservation is not permission to create a Checkout session. Creation remains deliberately disconnected from this module, and the currently inactive v2 Stripe products/prices guarantee test-mode refusal.
3. A future controlled creation flow requires server-derived immutable user identity, stable idempotency key and request parameters, provider-operation timeout and recovery, restricted network/service account, and signed webhook/settlement checks.
4. No production migrations, isolated production PITR restore, alerting/runbooks, refund review or final release approval have been verified.
5. Keep legacy Replit integration disabled and refrain from any Replit billing usage.
