# Healthwise v2 — owner-bound Checkout reservation gate

**November 14, 2026 | Engineering Vault NO-GO**

## Defect addressed
The private Checkout preparation coordinator checked `accounts.provider_subject` before Stripe price preflight, but its eventual PostgreSQL journal reservation did not recheck or lock the authenticated owner. A privileged reassignment of `consultation_orders.account_id` between the first read and the write could reserve a Checkout attempt for the wrong owner.

## Implementation
- `rebuild/src/integrations/stripe-v2-owner-bound-reservation.mjs`: opens a dedicated PostgreSQL transaction; `SELECT ... JOIN accounts ... FOR UPDATE OF o` verifies the expected trusted provider subject and all order/monetary terms under an order-row lock; then calls the existing conditional journal reservation on **the same locked connection**, committing only on success and rolling back any error.
- `rebuild/src/integrations/stripe-v2-checkout-preparation.mjs`: selects this owner-bound variant when `expectedOwnerSubject` is supplied by the private coordinator. The generic engineering-only reservation remains for other isolated tests.
- `rebuild/src/integrations/stripe-v2-private-preparation-coordinator.mjs`: derives `expectedOwnerSubject` from the trusted authenticated principal, not a caller-supplied payment parameter.
- Unit regression covers simulated owner reassignment between the preliminary check and final row lock.
- `rebuild/test/postgres-v2-owner-bound-reservation.mjs`: in disposable PostgreSQL, tests idempotent owned reservations, competing keys, reassignment before the locked write, and a second connection's competing reassignment transaction. Wrong owner must not produce a journal entry.
- CI now executes that script as part of the disposable `postgres-integration` job.

## Limitations and future controls
- Ownership is checked and locked **during reservation**. After this transaction commits, a privileged reassignment could still happen before any future external Checkout creation unless immutable account ownership is enforced by an approved schema invariant, or ownership is revalidated at an appropriately controlled final creation gate. **No actual Checkout creation flow exists in this module.**
- The trusted principal must come from server authentication middleware. Its provider subject must never be taken from an untrusted request body.
- The new test is committed, **not certified passing** until a GitHub Actions run at the latest SHA is independently inspected.
- No Stripe provider writes, activation, webhook enablement, public routing, schema migration, Replit operations, or production deployments were performed.
- Earlier run #257 at `f9c2bbb` passed. That is a previous commit, not evidence that this new change passed CI.

## Next
1. Verify the latest CI unit and disposable PostgreSQL jobs.
2. Before any test Checkout creation: enforce immutable order ownership (or final locked owner recheck and post-commit integrity), review durable journal age/uncertain provider outcomes, and use an isolated signed webhook destination.
3. Explicitly authorize specific test-only Stripe price activation/Checkout/webhook operations as a separate gated experiment.
4. Production release still requires isolated production PITR restore, migration rollback, monitoring, security review and founder approval.
