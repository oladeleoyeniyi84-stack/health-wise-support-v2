# Healthwise Support v2 — Immutable Checkout request snapshot gate

**2026-11-14 | Engineering Vault NO-GO | No new hosting or Stripe charges**

## Verified baseline
User-supplied GitHub Actions screenshot showed run #289 green at commit `3dc85cd`, covering the stale journal age checks. The changes below are newer and require their own CI verification.

## Design-only implementation
- `rebuild/src/integrations/stripe-v2-request-snapshot.mjs` derives a deterministic SHA-256 request fingerprint from the pinned v2 test-only catalog, account ID, order UUID, authenticated owner subject, tier, price, amount, currency, quantity, payment mode and durable idempotency key.
- `rebuild/db/004_checkout_request_snapshots.sql` defines one snapshot per order with a unique idempotency key and immutable UPDATE/DELETE triggers. It is **not applied to production**; disposable-schema tests only.
- The snapshot writer atomically inserts only if a pending order, owner, money fields and prepared journal match the pinned snapshot. An exact repeated write returns a read-only matching result; conflicting terms are rejected. The retry read also checks current order and journal state, not just the old snapshot row.
- `rebuild/test/stripe-v2-request-snapshot.test.mjs` tests canonical hashing, immutable terms, exact replay, tampering, and mismatched prior records.
- `rebuild/test/postgres-v2-request-snapshot.mjs` exercises design-only migrations 001–004 in a temporary disposable PostgreSQL schema. It checks single creation, same-term retry, update/delete denial, changed idempotency key, and changed order amount. The schema is dropped afterward.
- The existing `postgres-integration` GitHub Actions job now runs the new disposable database test.

## Critical non-authorizations
The snapshot layer does **not** call Stripe, create Checkout sessions, activate test prices, register webhook endpoints, grant entitlements or publish any service. It is not wired into a final provider-write orchestrator. A canonical snapshot is not proof of no previous Stripe session, and a valid snapshot is not consent to retry Checkout creation.

## Remaining work
1. Inspect the latest CI job output for this exact branch head. Fix regressions before moving on.
2. Before any provider write, design an atomic coordinator to bind authenticated identity, reserved journal and snapshot to exact Stripe API parameters including fixed HTTPS redirect destinations, limited TTL, provider uncertain-outcome recovery and manual review.
3. Verify isolated webhook ingress/managed secrets, durable database, monitoring and no-Replit deployment environment; cap any prospective spending.
4. Require specific authorization before enabling a v2 test price, creating Checkout or registering a hosted test webhook.
5. Production backup/PITR isolated restore, migrations/rollback, security review and founder sign-off are still blocked.

**No new recurring expense, Replit operation, Stripe mutation, merge or production deployment occurred.**
