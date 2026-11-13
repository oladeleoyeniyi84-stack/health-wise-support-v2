# Phase 11: Short transaction design

Added a separate, **unwired** two-stage sandbox reconciliation prototype.

1. Read order snapshot without locking.
2. Fetch authoritative Stripe line items outside the transaction.
3. Begin transaction, lock order, insert unique event, compare locked order to snapshot, and apply only the permitted transition.

This avoids a provider network call inside the transaction and detects changed order bindings. It is not a replacement for the signed webhook handler yet. Signature verification must remain at the ingress boundary; only trusted verified events may be passed to this module. The production adapter must implement findOrderBySession with parameterized SQL and isolated DB access. The workflow must also handle provider timeouts/retries, Stripe API version compatibility, settled payment methods, refunds and chargebacks, concurrent duplicate events, and transactional audit logging.

**Not verified:** test execution, real PostgreSQL concurrency, real Stripe signatures, migrations, recovery, or production readiness. Existing signed webhook path still uses the earlier transaction design; do not expose either path publicly.
