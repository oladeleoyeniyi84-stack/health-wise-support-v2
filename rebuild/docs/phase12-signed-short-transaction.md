# Phase 12 — signed short-transaction reconciliation

Added preferred, **unwired** entrypoint `processSignedSandboxReconciliation` combining signature verification with two-stage payment reconciliation. The old `processSandboxWebhook` remains present for compatibility with existing tests but uses provider lookup inside the transaction; it must not be used as the release entrypoint.

The PostgreSQL adapter now exposes a parameterized, non-locking `findOrderBySession` snapshot query. It is still untested against a real database.

No webhook route, real provider connection, database migration, or booking release is enabled. Signature verification is mocked in tests, not proven against official Stripe SDK fixtures. Before release: remove/retire old path; test complete suite and isolated Postgres; verify real Stripe signatures; confirm retries, ordering, refund/dispute handling and audit events; review network timeout and transaction semantics.
