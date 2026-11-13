# Healthwise v2 — isolated Checkout session binding checkpoint (2026-11-13)

**Engineering Vault: NO-GO.** No v2 price activation, Checkout creation, webhook configuration, Replit action, deployment, or production database migration was performed.

## Implemented
- `rebuild/src/integrations/sandbox-session-binding.mjs` adds an engineering-only `bindSandboxCheckoutSession` method using an injected PostgreSQL pool.
- Validates UUID order ID, `cs_test_` Checkout session ID, `price_` ID.
- Uses a guarded atomic SQL `UPDATE ... WHERE status='pending' AND configured_price_id=$3 AND stripe_session_id IS NULL`, returning the bound ID; the existing design-only migration specifies `UNIQUE(stripe_session_id)`.
- A safe retry reads current binding and succeeds only when session, price, and pending status all match. Conflicting rebinds fail closed. Database failures are propagated.
- `rebuild/test/sandbox-session-binding.test.mjs` has mock database contract tests for atomic SQL, idempotent retry, conflicts, malformed input and failure propagation.

## Important limitations
- This is an **isolated prototype**, not yet connected to the Stripe checkout adapter, an HTTP route, or a production database.
- Mock SQL tests do not replace a disposable PostgreSQL concurrency and crash-recovery test.
- Creating a Stripe session happens outside the DB transaction. If persistence then fails, the Stripe session can become orphaned. Before a test-mode write, implement an explicit recovery journal/idempotency strategy and reconciler to safely recover or expire orphaned sandbox sessions.
- The current checkout adapter trusts a separately asserted test-mode guard; authenticated process-level account checks and active-price preflight must be composed in a controlled orchestrator, not passed from user input.
- All new v2 Stripe products/prices remain inactive. Stripe sandbox's legacy Replit webhook remains disabled. Existing source contains no public payment route.
- Latest commits require fresh CI confirmation; do not claim a green run prematurely.

## Remaining release blockers
Production isolation, backup/PITR restore rehearsal, schema migration and rollback, verified authenticated Stripe webhooks, failure monitoring, refunds/disputes controls, Calendly/Replit external audit, and explicit public release approval.
