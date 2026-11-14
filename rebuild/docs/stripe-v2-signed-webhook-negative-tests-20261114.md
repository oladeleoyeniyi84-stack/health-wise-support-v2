# Healthwise v2 — signed webhook reconciliation negative-test gate

**2026-11-14. Engineering Vault NO-GO.**

## Evidence baseline
GitHub Actions run 43615034287 at 5c3f656 independently passed **189/189** unit tests and all four jobs (unit, disposable PostgreSQL, synthetic backup/restore, offline Stripe SDK). This is an earlier commit, not a claim about the newly added tests.

## This change
Extended `rebuild/test/signed-reconciliation.test.mjs` with isolated, dependency-free tests covering:
- invalid event type and non-sandbox Checkout session ID before any database read;
- validly signed event with mismatched Stripe client reference, order ID, tier, amount, currency or unpaid status; all must route to manual review, not mark paid;
- same webhook delivered twice: decision applied once, later delivery returns duplicate;
- Stripe provider outage or paginated/incomplete line-items: retryable error before transaction;
- empty, oversized and non-buffer raw webhook body rejected before signature verification;
- database decision failure propagates; the repository must roll back its transaction and permit redelivery.

No HTTP route, webhook endpoint, Stripe checkout session, price activation, database migration, provider write, or production deployment was introduced. The tests use only injected synthetic provider responses and mocked repository contracts. The full signed-webhook PostgreSQL retry/rollback integration continues to be covered by the existing disposable test job.

## Outstanding before controlled sandbox Checkout experiment
1. Verify current GitHub Actions results for the new negative tests.
2. Ensure real v2 Checkout prices/products are deliberately activated **only** after specific founder approval and reviewed server-side orchestration, not as part of tests.
3. Ensure the eventual webhook endpoint uses the verified sandbox account and an independently protected signing secret; never reactivate the legacy Replit endpoint.
4. Complete real sandbox provider interaction, full order reconciliation, refund/exception runbooks, production isolated PITR restoration and production migration rollback readiness before release.
