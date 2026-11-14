# Healthwise v2 — isolated sandbox webhook boundary (2026-11-14)

**Engineering Vault NO-GO. No deployed endpoint, provider activation, or public route.**

## Baseline
GitHub Actions workflow-list screenshot shows run #268 success at commit `47d79d1` for the immutable-ownership gate. This is earlier than the new webhook adapter and does not certify these new tests.

## Implementation
- `rebuild/src/integrations/isolated-sandbox-webhook-adapter.mjs` is an **unmounted** request-to-response function, not an HTTP listener. It is deliberately NOT imported into `rebuild/src/server.mjs`, whose booking, checkout and API operations remain blocked.
- Accepts only POST and application/json; enforces a maximum raw payload of 256 KiB and an 8 KiB cap on Stripe-Signature header.
- Retains raw bytes and invokes existing `processSignedSandboxReconciliation`, which authenticates the Stripe SDK signature, rejects live events, fetches provider line items and atomically reconciles via the repository.
- Acknowledges successful/duplicate/manual-review decisions with 200. Invalid signature, wrong event environment and malformed signed session return 400. Missing signer configuration, Stripe/provider outage, database failure and any unknown reconciliation fault return 503 so the delivery remains retryable.
- Results deliberately contain only generic status codes, never secrets, event payloads, provider stack traces or booking identifiers.
- `rebuild/test/isolated-sandbox-webhook-adapter.test.mjs` uses synthetic payloads and injected providers to test request rejection before IO, signature failure, live-mode rejection, successful reconciliation, manual review, retryable provider/database failures and missing secret handling.

## Hosting and release gates still OPEN
1. A dedicated **isolated** TLS-only sandbox host, not production and never Replit, with private disposable PostgreSQL and a verified immutable-ownership schema.
2. Streaming request-size enforcement at reverse proxy and runtime **before** allocating the raw body; this in-memory adapter is not by itself adequate DoS protection.
3. Stripe-specific endpoint secret in an isolated secret store; signature timestamp tolerance and rotation procedures using the official SDK, plus event allowlist and metrics.
4. Network admission throttling, backpressure, provider retry handling, logs redaction, alerts and reconciliation/reporting runbook; no sensitive data in HTTP error bodies.
5. Integration tests using a real Node HTTPS webhook server within isolated CI before any externally accessible endpoint is deployed.
6. Explicit founder authorization for any v2 Stripe test Price/Product activation, new webhook registration and actual test-mode Checkout creation.
7. Isolated production backup/PITR recovery verification, schema migration/rollback, security review and final approval before public launch.

**No Stripe provider write, Checkout session, price activation, webhook registration, production migration, merge or deployment was performed.**
