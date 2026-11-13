# Healthwise v2 — known-session authenticated recovery workflow

**Engineering Vault: NO-GO.** Development-only. No Stripe writes, Checkout creation, price activation, webhook registration, Replit tasks, production migration or deployment.

## Implemented 2026-11-13
- `rebuild/src/integrations/sandbox-known-session-recovery.mjs` composes read-only Stripe account and balance checks, database-sourced order expectations, verified known-session Stripe retrieval and a two-record atomic PostgreSQL binding.
- `rebuild/test/sandbox-known-session-recovery.test.mjs` mocks the complete path, including exact account match, test mode, expected price/line item, database rollback on second-write failure, and failed provider verification.
- The orchestrator derives expected price, consultation tier, user ID and amount from database records and the pinned separate v2 catalog. It does not use request-provided price or amount.
- A completed or expired test Checkout session is returned for manual review instead of automatically granting a booking entitlement. No payment settlement is inferred.
- Unknown/missing session IDs are rejected; discovering a provider session ID not persisted locally remains a separate unresolved recovery requirement.

## Security limitations and verification
- The authenticated account check uses injected Stripe SDK methods `accounts.retrieve()` and `balance.retrieve()`. The underlying SDK client and credentials must be trusted and independently provisioned.
- Read-only provider verification and database attachment are separate steps. Row-level guards prevent changed order, price, attempt key or session from being rebound during the transaction; external/provider state can change and requires further release-grade reconciliation.
- The application has **no public route** calling this module. It is not a production-ready recovery worker.
- GitHub commit workflow lookup returned no PR-associated result for recent commits. Do not assert a CI pass until a current run and logs have been independently inspected.
- A real disposable database test of this orchestrator and provider-failure injection remain required before Checkout activation.
- Replit billing and legacy Calendly integrations are independent audit items, and production recovery, migration, webhook delivery and operational controls remain blockers.
