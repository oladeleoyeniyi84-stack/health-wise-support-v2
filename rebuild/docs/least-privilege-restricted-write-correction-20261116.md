# Healthwise Vault — PostgreSQL least-privilege transactional write revision
Date: 2026-11-16. **Engineering Vault / Draft PR #1 / NO-GO.**

## Confirmed implementation defect
The original direct-transaction writer used `SELECT ... FOR UPDATE` on `vault_sessions` and `SELECT ... FOR SHARE` on `vault_write_grants`. PostgreSQL requires UPDATE privileges on at least one column for such locking queries. Its disposable test role had SELECT only on those tables. That contradicts the earlier assumption that the direct role could both perform those locks and remain unable to change session/grant rows.

**Never solve this by granting the restricted application login arbitrary UPDATE on session or grant tables.** The legacy adapter is explicitly marked non-release-eligible, and its original test has been changed to assert denial with the restricted role rather than false success.

## Revised disposable proof-of-concept
1. `src/integrations/postgres-restricted-note-write.mjs` invokes exactly one fixed function `vault_write_owned_note($1,$2,$3)` with three bound arguments and a session ID from a per-request, independently verified server dependency.
2. `test/support/disposable-owned-note-function.mjs` provides a **test-only** `SECURITY DEFINER` PL/pgSQL routine with fully schema-qualified table references and fixed `search_path=pg_catalog,pg_temp`. It locks and validates the unrevoked session, the record owner, and the exact-purpose active write grant, and then updates one synthetic note within that same database call.
3. `test/postgres-restricted-owned-note-write.mjs` provisions a disposable, randomly named schema and a separate login having **USAGE on the schema and EXECUTE on only this routine**. It expressly lacks direct table privileges. Tests cover authorized and cross-account writes, expired/revoked sessions, revoked grants, forbidden privileged SQL, and a concurrent session revocation that should block and then deny the pending write.
4. `src/integrations/vault-restricted-http-bridge.mjs` composes the previously built mutation gate and the restricted stored-function write adapter, maintaining per-request identity. The toy `test/vault-restricted-http-bridge.test.mjs` verifies simultaneous synthetic users and denies cross-account writes or missing CSRF. No real route or clinical data is involved.
5. The isolated GitHub Actions workflow now syntax-checks the new modules and runs the disposable restricted-function PostgreSQL integration test. The older direct writer remains a denial regression.

## Release restrictions
This is NOT a production database migration or reviewed SQL function. The fixture function is owned by the disposable test database administrator; production must use an independently reviewed **non-superuser**, tightly scoped function owner, secure function deployment, minimal EXECUTE privilege, locked-down schema permissions, monitored audit trails, transaction and revocation race verification, and security review. Never let untrusted callers control `search_path`, SQL function definitions, session IDs, permission names or target schema.

The external HTTPS transport verifier and write permission in the HTTP test are test doubles, not an audited identity provider. Production sign-in, secure key management, historical data preservation, backups, PITR, media storage, privacy, durable logs and full backend build remain open.

**Verification:** GitHub commits and source readbacks establish files exist, not that CI is green. Run exact-head checks and inspect output before approval. No merge, production SQL, Stripe writes, live customer data, deploy, purchase or public release.
