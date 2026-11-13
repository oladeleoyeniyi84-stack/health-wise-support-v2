# Phase 17 — opt-in local PostgreSQL integration gate

GitHub Actions run 34 verified 78/78 dependency-free unit tests.

Added `test/postgres-integration.mjs` as a **manual, opt-in** disposable PostgreSQL migration/constraint smoke check. It requires a local PostgreSQL instance, the `pg` package, `HEALTHWISE_TEST_DATABASE_URL`, and `HEALTHWISE_ISOLATED_DB_ACK=YES_DISPOSABLE_DB`. It rejects non-local database hostnames and uses a transaction rollback. No external infrastructure or database is provisioned.

Example, only after setting up a dedicated disposable local database:

```sh
cd rebuild
npm install --no-save pg
HEALTHWISE_ISOLATED_DB_ACK=YES_DISPOSABLE_DB HEALTHWISE_TEST_DATABASE_URL='postgres://localhost/healthwise_disposable' node test/postgres-integration.mjs
```

**Not yet executed**: no local PostgreSQL service was available in the development environment. This is a limited migration/constraint smoke test, not proof of concurrency safety, transaction retries, restore procedures, or provider correctness. Never use production or shared database credentials.
