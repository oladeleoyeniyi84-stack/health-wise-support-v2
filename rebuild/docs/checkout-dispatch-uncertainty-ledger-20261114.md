# Healthwise Support v2 — Irreversible Checkout dispatch uncertainty gate

**2026-11-14 | Engineering Vault NO-GO | $0 additional infrastructure provisioned**

## Baseline
The last independently user-shared screenshot showed the previous locked Checkout audit run #306 succeeding at commit `754612f`. The newer locked-audit work at `cef87f8` and the changes here require independent exact-head CI verification; a prior green run is not proof that these pass.

## What changed
- Design-only migration `rebuild/db/006_checkout_dispatch_ledger.sql` creates an order-keyed irreversible record linked to the immutable full-request snapshot. Allowed states: `outcome_uncertain` and `manual_review`. Row UPDATE is permitted only once, from uncertain to manual review, preserving order ID, request hash and original claim time. DELETE is forbidden.
- `rebuild/src/integrations/stripe-v2-blocked-dispatch-ledger.mjs` performs a DB-only `claimBlockedV2CheckoutDispatch`. It re-derives the pinned complete Checkout request fingerprint including immutable return URLs, starts a transaction, locks the order row, validates authenticated ownership, current monetary terms, journal status/age, base snapshot and full fingerprint, then inserts one uncertainty record with `ON CONFLICT DO NOTHING`. A second worker or replay is rejected. No Stripe SDK/HTTP dependency and no actual dispatch is possible.
- A read-only `inspectBlockedV2Dispatch` refuses to authorize retry, including when the ledger row is missing or in manual review.
- Unit regression tests cover exactly-once claim, denied duplicate, stale attempt, altered terms and origin, and no-retry inspection.
- Existing disposable PostgreSQL full-request test now applies migration 006, races two claim operations using separate pool clients, expects only one success, rejects deletion/reset of uncertainty, and confirms manual-review state is irreversible. That test is already wired to the `postgres-integration` CI job.

## Safety interpretation
A durable uncertainty record means: *a provider request may have been attempted or may be attempted outside this code in the future.* The current implementation **never contacts Stripe**, never exposes a payment link and explicitly returns `providerWriteAuthorized:false`, `retryAllowed:false`, `release:'blocked'`.

The ledger is a conservative safety barrier, NOT an end-to-end dispatch implementation. A safe future provider-call architecture needs a reviewed outbox/dispatcher with exact provider request byte/option consistency, controlled transition timing, session binding, read-only provider reconciliation, and a manual-review audit trail. **Do not automatically reuse an idempotency key, create a second session, or clear an uncertain row** after timeout or crash.

The immutable ledger is a **design-only migration** applied to disposable PostgreSQL test schemas. Do not apply to production before PITR/restore and migration rollback validation, access-controls review and founder approval. The existing unmounted Stripe creation adapter and public 503 preview remain unchanged.

## Remaining gates
1. Verify latest GitHub Actions run on exact latest commit (unit, PostgreSQL integration, synthetic restore, offline Stripe SDK).
2. Review manual-review resolution procedure, provider status reconciliation and event observability; never infer absence of a Stripe session from an incomplete listing.
3. Independently verify isolated HTTPS host and managed secrets, with a cost cap before provisioning.
4. Require separately scoped founder approval before sandbox price activation, webhook registration or actual test-mode Checkout; production release is separate.

**No Stripe operations, Replit usage, deployment, new expense or PR merge occurred.**
