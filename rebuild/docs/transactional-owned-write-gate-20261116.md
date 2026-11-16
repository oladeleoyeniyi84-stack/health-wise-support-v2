# Healthwise Engineering Vault — transactional owner-bound write gate
Date: 2026-11-16. **Draft PR #1 / NO-GO. Never connect this adapter to production.**

## Scope committed
- `src/integrations/postgres-owned-note-write.mjs` is a deliberately narrow fixed SQL example. It performs an owned-record `note` update **only within one PostgreSQL transaction**, and returns false for unverified/expired/revoked sessions, ownership mismatch, inactive/missing exact-purpose grants, failed updates or database errors.
- The transaction locks the session row (`FOR UPDATE`), then the target owned record (`FOR UPDATE`), then the exact-purpose active grant (`FOR SHARE`), before executing a parameterized `UPDATE` and `COMMIT`. Updating the locked session/grant to revoke access must serialize with this sequence. A failure issues `ROLLBACK`.
- `test/postgres-owned-note-write.mjs` uses only the existing guarded disposable PostgreSQL service, random dedicated schema, restricted database login and synthetic identities. It covers permitted ownership, cross-account denial, invalid input, revoked/expired sessions, revoked grants, denied privileged SQL and a concurrent revocation held under a session-row lock.
- `.github/workflows/healthwise-rebuild-tests.yml` now runs Node syntax checks and the disposable PostgreSQL integration test within the existing isolated job.

## Limitations and explicit trust boundary
This is **NOT a production mutation API, clinical note system, or authorization service.** The note field is synthetic test data, not health information. The application is not ready to store medical/wellness records. `getVerifiedSessionId` must be provided **per request** by independently verified server middleware; it must never come from HTTP parameters, forged headers, session IDs in client JSON, or application-global mutable state. The test's mutable session fixture is for sequential test cases only.

The HTTP mutation gate from the preceding milestone is not wired to any live route. An eventual integration must ensure that (1) transport, signed cookie and CSRF checks succeed, (2) independent operation-specific permission is enforced inside the SAME database transaction that performs the write, and (3) lock order is globally consistent across revocation, rotation and owner/grant mutation paths. Do not rely on a previous read-only permission check as authorization to write. Use a least-privileged purpose-specific PostgreSQL role and separate privileged revocation interface.

Credential custody, real identity verification, key rotation, full canonical backend, production data ownership, app-specific recovery/PITR, hosted HTTPS, audit logs, rate limits, privacy obligations, and release approval remain open. The test fixture and schema are discarded, not migrated.

## Evidence status
GitHub commit acceptance proves the files were written, NOT that CI passed. Require exact-head successful GitHub Actions evidence, including disposable database tests, before claiming this gate verified. Earlier successful screenshots are not sufficient.

**No merge, production SQL, live Stripe, deployment, paid service, or public release. Engineering Vault stays NO-GO.**
