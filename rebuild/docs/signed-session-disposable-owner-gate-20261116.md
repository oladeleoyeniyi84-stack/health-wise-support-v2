# Signed server-session verification — isolated Healthwise owner-read gate

**2026-11-16 — Engineering Vault ONLY / NO-GO.** No production auth routes, sessions, credentials, payment, migration, or deployment.

## Added
- `src/integrations/signed-session-verifier.mjs`: strict `v1.<session_id>.<HMAC-SHA256>` credential verification with a server-only random signing key, fixed-length timing-safe signature comparison, and independently loaded, non-revoked, non-expired session record. Domain-separated HMAC input: `healthwise.session.v1:<session_id>`. Invalid input and datastore failure return null, never approval.
- `src/integrations/postgres-session-reader.mjs`: parameterized session lookup using an injected restricted PostgreSQL connection. No browser-supplied authorization flags.
- `test/signed-session-verifier.test.mjs` and `test/postgres-session-reader.test.mjs`: offline negative tests for forged signatures, malformed session IDs, expiry, revocation, invalid identities, ambiguous rows and outages.
- `test/postgres-signed-owner-e2e.mjs`: disposable-Postgres test with a SELECT-only login: authenticated signature -> database session lookup -> parameterized owner-record check. Includes tampered signatures, cross-account changes, revoked/expired sessions and denied UPDATE operations.
- GitHub Actions integration under `postgres-integration`; unit files run through the existing `npm test` glob.

## Explicit trust boundaries and remaining requirements
This is an **isolated authentication verification primitive**, not a production login or authenticated HTTP middleware. Credential issuance, secure `HttpOnly; Secure; SameSite` cookies, session ID rotation, per-request context isolation, CSRF protection for future state-changing operations, rate limiting, logout/revocation semantics, trusted proxy/HTTPS configuration, key management/rotation and audit logs remain unimplemented.

No signing key or token is stored in the repository; tests use random ephemeral keys. A production secret must never be accepted from request fields. No real session is issued or persisted outside disposable test fixtures.

The current existing owner-read adapter must not be wired globally to an HTTP request or shared mutable authenticated-session variable. Production integration must ensure request-specific authenticated context, appropriately constrained database privileges, and transaction/ownership consistency for any future writes.

## Verification policy
GitHub commit acceptance proves files exist, not that tests passed. Require an exact-head successful CI run including unit, disposable PostgreSQL, synthetic recovery and safety checks, followed by a complete canonical backend build and founder review. Preserve Draft PR #1 and Engineering Vault **NO-GO** until all gates are proven.
