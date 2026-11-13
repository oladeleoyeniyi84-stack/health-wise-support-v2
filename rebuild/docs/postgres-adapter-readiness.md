# PostgreSQL event adapter — engineering-only

The adapter in src/integrations/postgres-events.mjs uses an injected pg-compatible pool and SQL transactions with row locks, unique event IDs, rollback, and client release. It has **mock-based tests only**; no real PostgreSQL migration, concurrency test, or recovery rehearsal has run.

IMPORTANT: A successful paid event creates a **pending** entitlement only. Pending is NOT permission to book. Do not promote to ready until independent verification of Stripe test-mode line items, price ID, total, currency, settlement, refunds/disputes and customer ownership. Provider event duplicate/retry and event ordering need integration testing.

A dedicated database is required; do not point this adapter at the existing BrandHub database. No credentials, DB connections, migrations, Render changes or Stripe calls were made. This adapter is not wired into an HTTP route.

Before release: validate official Stripe SDK signature verification with genuine signed fixtures, use a restricted database role, run isolated migration/rollback and restore, test concurrent delivery, document operator reconciliation and exception handling, verify no entitlement is granted on redirect alone.
