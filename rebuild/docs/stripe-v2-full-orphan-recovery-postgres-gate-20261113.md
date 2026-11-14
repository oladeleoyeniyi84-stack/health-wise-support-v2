# Healthwise v2 — full orphan discovery-to-recovery PostgreSQL gate

**Engineering Vault: NO-GO.** No Stripe session creation, price activation, payment capture, webhook registration, Replit work, public route, production database migration or deployment.

## Implemented
- Added `rebuild/test/postgres-discovered-session-recovery.mjs`, guarded by the explicit local-only disposable DB acknowledgement. Creates a temporary schema; applies `001_foundation.sql` and `002_sandbox_checkout_attempts.sql` within it; cleans it up afterward.
- Seeds four synthetic pending quick-tier orders and durable idempotency attempt records.
- Uses an **offline, injected Stripe test client** with sandbox account and livemode checks; no network Stripe requests.
- Verifies full discovery → independently reverified known-session → atomic order-and-journal binding; no entitlement grant.
- Verifies ambiguous duplicate/truncated listings and provider outages cannot bind a session; changed provider response on the second read fails closed.
- Checks concurrent recovery, allowing only same-session idempotent outcomes; checks unique stored order/journal session IDs.
- Injects a PostgreSQL trigger failure during the second update and checks **both database records roll back**.
- Added script to the existing GitHub Actions disposable PostgreSQL integration job.
- Fixed an earlier invalid PL/pgSQL trigger delimiter in `rebuild/test/postgres-session-binding.mjs` using named dollar quoting.

## Evidence boundaries
- **CI passing status not established**: GitHub combined-status lookup returned no status entries for the workflow commit. The changes are committed but not confirmed green. Earlier Stripe account-identity success does not verify these new tests.
- No actual disposable PostgreSQL run or real Stripe SDK read-only session listing was independently observed in this turn. Static review does not certify integration readiness.
- The module assumes trusted server-side Stripe credentials, verified account identity, and database-only order context. It is not connected to a public route or active worker.
- A bounded completed Stripe session listing is not definitive historical proof of nonexistence; no-match, truncated results, expired requests and uncertain provider outcomes must never trigger a new Checkout idempotency key automatically.
- No production backups/PITR restore rehearsal, full webhook delivery / settlement, refund / reconciliation controls, or final app release approval has been established.

## Next gates
1. Independently inspect current GitHub Actions workflow result and logs for unit, postgres-integration, disposable-restore and stripe-sdk-offline.
2. If any test fails, repair on the isolated branch and rerun before marking this gate complete.
3. After green CI, review provider API semantics and Stripe idempotency retention before any explicitly scoped one-session test-mode write.
4. Keep all three v2 sandbox products/prices inactive and the app in Engineering Vault NO-GO.
