# Healthwise Engineering Vault — request-scoped cookie authentication checkpoint

**2026-11-16 — Draft PR #1 / NO-GO.** No public route, production cookies, customer records, Stripe calls or deployments.

## Added in this checkpoint
- `src/integrations/vault-request-auth.mjs` strictly parses exactly one `__Host-healthwise_vault` cookie (size, control-character, duplicate and signed-token format rejection). The cookie is treated only as a credential to the previously introduced cryptographic session verifier; it cannot itself claim identity, role or approval.
- `createVaultRequestAuthorizer` injects the independently trusted `verifySignedSession` and read-only PostgreSQL owner proof. It creates a **new frozen authorization capability for each request** with a private closure for that specific verified session. No mutable application-wide current user, and no credential/session ID is exposed in the returned context.
- `test/vault-request-auth.test.mjs` covers forged/missing/duplicate cookies, client-supplied identity claims, verification failures, overlapping authenticated users and cross-account denials.
- `test/vault-request-loopback.test.mjs` uses a test-only HTTP server bound to `127.0.0.1` to exercise simultaneous requests and verify correct owner-only results. It is not imported into any deployed route.
- These dependency-free test files match the existing `npm test` glob in the isolated rebuild workflow.

## Security boundaries and remaining work
Cookie policy for a future trusted HTTPS issuer: host-only `__Host-` name, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`; the source exposes a documentation-only policy and **does not issue any cookie**. The production issuer must enforce those attributes over HTTPS and manage credential rotation, logout, expiration, theft/replay mitigation, and key storage. Signed credentials are replayable until expiry/revocation: signing alone is not session fixation/replay protection.

This is not real login middleware or a production endpoint. Signing keys and fixture session records exist only inside tests. The request-specific object must never be cached or carried across requests. Real session issuance, storage, authenticated transport, CSRF protection for future mutations, rate limiting, logging redaction, row-level ownership controls, durable revocation, integration with a completed canonical backend, and independent recovery evidence remain open.

## Verification and release decision
The GitHub Actions workflow should run `rebuild/test/*.test.mjs`, but a successful commit is not proof of passing CI. Require an exact-head workflow run with successful jobs and review before release decision changes. Draft PR #1 stays unmerged, Healthwise remains in the Engineering Vault, and the release decision is **NO-GO**.
