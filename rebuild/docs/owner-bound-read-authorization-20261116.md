# Healthwise — Owner-bound read authorization contract (2026-11-16)

**Engineering Vault / NO-GO. No production routes, secrets, databases, migrations, checkout, deployment or provider writes.**

## Implemented
- `src/domain/owner-read-guard.mjs`: asynchronous authorization helper that accepts only an independently trusted server-session resolver. It compares a strictly validated, unexpired, non-revoked server-verified subject against the record's owner ID.
- `test/owner-read-guard.test.mjs`: positive owner test and negative cases for account mismatch, client-style verified flags, invalid owner identifiers, revoked/expired identity, untrusted extra request fields, and session-store failure.
- Existing `npm test` on the isolated rebuild runs the new test file through `node --test test/*.test.mjs`.

## Integration restrictions
This is a **domain contract**, not login, session issuance, middleware, trusted identity verification, a database policy, or evidence of HIPAA compliance. No client-provided role, JWT claim, subject ID, or `serverVerified` flag may be passed as the resolver's authority. A real server-side authenticated session loader and independent database owner lookup must be designed, integrated and tested against a disposable app-owned database before any endpoint may rely on this contract. Ensure record ownership comes from trusted storage rather than request-supplied parameters.

## Release decision
Preview and isolated tests do not establish production readiness. Keep Draft PR #1 unmerged, disable booking/checkout/account endpoints, and require exact-commit successful CI, server-authenticated integration tests, staging verification and founder approval.
