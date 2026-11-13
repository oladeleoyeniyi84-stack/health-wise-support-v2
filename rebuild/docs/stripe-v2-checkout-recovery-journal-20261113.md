# Healthwise v2 — durable sandbox Checkout reservation journal

**Engineering Vault: NO-GO. Design-only, not production applied.**

## Problem being addressed
Stripe can successfully create a test Checkout session while the application crashes before saving the returned session ID. A session-binding UPDATE alone cannot guarantee recovery. Never create a second Checkout session with a fresh idempotency key merely because the local order has no session recorded.

## Implemented in development branch
- `rebuild/db/002_sandbox_checkout_attempts.sql` defines one attempt per order, a globally unique immutable idempotency key, an optional session ID, and `prepared / bound / manual_review` states. **This migration has not been applied to production or any persistent environment.**
- `rebuild/src/integrations/sandbox-checkout-attempts.mjs` atomically reserves an attempt for a pending order with the expected Price ID and unbound session. Existing reservations are accepted only if the original key, price and prepared state match.
- `rebuild/test/sandbox-checkout-attempts.test.mjs` covers first reservation, same-key repeat, conflicts, validation and DB failure.
- `rebuild/test/postgres-session-binding.mjs` now applies the design migration to its temporary disposable schema and races distinct idempotency keys for one order. It checks that only one reservation persists and that a key cannot be reused for a second order.
- The PostgreSQL integration job already runs `node test/postgres-session-binding.mjs`. No new paid infrastructure or Replit usage.

## Safety constraints still missing
1. This journal is **not yet coupled to a controlled Checkout creator**. Before any provider write, add a transactional order/attempt state machine and recovery worker, with crash injection at each boundary.
2. Retries must reuse identical Stripe parameters and the exact reserved key while Stripe's idempotency protection still applies. Stripe can prune old keys; **stale or uncertain attempts require manual reconciliation**, not automatic recreation.
3. Store and reconcile the Stripe response with immutable order context and only then move from `prepared` to `bound` atomically with the order's session binding. Handle uncertain provider failures without inventing an outcome.
4. Before any authenticated sandbox trial, confirm inactive v2 product/price activation scope, provider read-only preflight, signed webhook, idempotent reconciliation, and explicit user approval for external test writes.
5. Confirm CI results and disposable PostgreSQL verification; no passing results are asserted until independently obtained.

## Preserved isolation
All three new Healthwise v2 sandbox prices/products remain inactive. The legacy Replit sandbox webhook remains disabled. Public payment routes and deployment remain blocked.
