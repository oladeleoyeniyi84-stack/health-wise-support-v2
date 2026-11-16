# Healthwise owner read — disposable PostgreSQL integration (2026-11-16)

**Engineering Vault only / NO-GO.** No user-facing route or real database connection is authorized.

## Implemented scope
- `src/integrations/postgres-owner-read-proof.mjs` performs one parameterized SELECT/EXISTS check tying a record's stored `owner_id` to a session subject in independently trusted storage. Expired and revoked sessions are denied. It returns a boolean only and fails closed on errors.
- `test/postgres-owner-read-proof.test.mjs` checks dependency requirements, SQL parameterization, invalid IDs and session-store/database failures.
- `test/postgres-owner-read-isolation.mjs` exercises a **disposable** PostgreSQL schema and an independently credentialed SELECT-only role; it checks matching ownership, cross-account mismatch, revoked/expired/missing sessions, and SQL UPDATE denial. It cleans up its randomized schema and role.
- `.github/workflows/healthwise-rebuild-tests.yml` runs the integration under the existing disposable DB guard.

## Strict limitations
This is **not** a session verifier or production API. `getAuthenticatedSessionId` must eventually come from cryptographically authenticated server middleware; it cannot be populated from query/body/headers or client-declared account IDs. The test fixture simulates this dependency; it does not prove the real authentication stack exists.

The query deliberately returns only an authorization boolean. Production row policies, transactions, secure credential handling, data retention, recovery, breach response and legal/privacy compliance remain open. Trusting a frontend-supplied `recordId` is acceptable only for a lookup whose authorization is bound to immutable database ownership, and must not be repurposed for writes.

## Release requirements
Do not assign this adapter to production connection pools. Verify exact-head CI, backend integration, durable session issuer and revocation, least privilege, private app-owned database/recovery, staging security testing and explicit founder review before changing release decision.
