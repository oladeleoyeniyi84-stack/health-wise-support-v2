# Healthwise session lifecycle and CSRF checkpoint — 2026-11-16

**Engineering Vault ONLY. Draft PR #1, no production merge/deploy, no live payment or customer data.**

## Changes
- `src/integrations/vault-session-lifecycle.mjs`: server-only session credential issuance using 192 bits of cryptographic randomness, HMAC-SHA256 signatures compatible with the isolated verifier, one-hour expiry, secure host-only cookie serialization, fresh random IDs for rotation, revocation/logout clearing, and a synchronizer-style CSRF token bound to the session with a separately domain-separated HMAC.
- `src/integrations/postgres-vault-session-store.mjs`: injected PostgreSQL session persistence with transaction-backed creation, rotation, and revocation. Rotation marks the old session revoked and inserts the replacement under one transaction; a conflict triggers rollback.
- `test/vault-session-lifecycle.test.mjs`: issuance, credential rotation, stale/revoked rejection, logout, strict same-origin HTTPS and CSRF header verification, failure paths and dependency validation.
- `test/postgres-vault-session-lifecycle.mjs`: disposable PostgreSQL transaction/rollback verification using a separate restricted login. Included in the isolated GitHub Actions PostgreSQL job.
- Existing `npm test` glob includes the new dependency-free lifecycle unit tests.

## Mandatory integration rules
1. **Do not expose as a production endpoint.** The `requireAuthenticatedPrincipal` callback is an injected trust dependency; authentication via password, MFA or another independently verified identity provider has not been implemented.
2. **Never expose signing keys** to clients, repos, logs, or HTTP handlers. The returned CSRF token is intended only for a legitimate same-origin authenticated page, delivered through an appropriate protected response without caching. `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/` and `__Host-` semantics must be enforced by the actual HTTPS infrastructure.
3. **Guard state-changing routes** (including logout and rotation) with CSRF, session verification, and authorization *before* calling lifecycle methods. Merely having `authorizeMutation` available does not enforce it on any HTTP route. Never treat SameSite alone as a CSRF defense.
4. The database adapter is a **test foundation**, not production database ownership or safe deployment. Production SQL permissions, transactions, security audits, connection lifecycle, recovery, scaling and revocation semantics remain unverified. Use a separately owned Healthwise database only after preservation/cost approval.
5. Rate limits, credential theft/replay controls, key rotation, logout-all-sessions, idle timeouts, secure error handling, session enumeration protection, and request-level integration with the canonical backend remain outstanding.

## Evidence boundary
Files and CI steps are committed, but exact-head workflow success must be independently confirmed. Earlier green GitHub Actions runs do not validate these new tests.

**Decision: NO-GO. No merge, deployment, payment activation, production SQL, migration, or paid resources.**
