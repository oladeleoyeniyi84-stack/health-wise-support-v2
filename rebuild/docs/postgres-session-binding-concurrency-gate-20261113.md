# Healthwise v2 — disposable PostgreSQL session-binding verification gate

**Engineering Vault NO-GO — no real Stripe Checkout, payment, deployment or Replit usage.**

## Test changes (2026-11-13)
- Added `rebuild/test/postgres-session-binding.mjs`, guarded by `assertDisposableDatabase` and explicit `HEALTHWISE_ISOLATED_DB_ACK=YES_DISPOSABLE_DB`.
- Creates a unique temporary schema, applies the **design-only** SQL there, inserts two synthetic pending orders and drops the schema on exit.
- Races independent pg pool connections to bind different `cs_test_...` session IDs to the same order. Requires one success and one conflict.
- Verifies safe retry of the winning session, database UNIQUE constraint rejection for binding the same session to another order, wrong Price ID rejection, and refusal to rebind a paid order.
- Wired this script into the existing `postgres-integration` GitHub Actions job, using the same ephemeral PostgreSQL 16 CI service and disposable database.
- This integration test is a prerequisite for release; **a green CI run is not assumed until independently checked**.

## Unverified and next actions
- Session creation remains disconnected from durable binding. An outage after Stripe session creation could leave an orphan session. A durable pre-creation attempt record, stable provider idempotency key, explicit lookup/recovery or expiration, and crash-injection tests are necessary before enabling test Checkout creation.
- Production PITR / isolated recovery, payment reconciliation, provider-delivered webhook signature handling, operational alerts, release approval and Replit billing audit remain outstanding.
- New v2 product/prices are inactive, the legacy sandbox Replit webhook is disabled, and public payment endpoints stay blocked.
