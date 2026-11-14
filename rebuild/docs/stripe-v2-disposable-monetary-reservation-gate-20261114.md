# Healthwise v2 — disposable PostgreSQL monetary reservation gate

**November 14, 2026 — Engineering Vault NO-GO**

## Implementation
- Added `rebuild/test/postgres-v2-monetary-reservation.mjs`, an isolated PostgreSQL 16 integration test protected by `assertDisposableDatabase`, the exact disposable DB name/user, localhost-only connection, and explicit `YES_DISPOSABLE_DB` acknowledgement.
- The test creates a temporary schema, applies the two **design-only** SQL migrations within that schema, inserts synthetic pending consultation orders, and drops the schema after execution.
- Validates successful first reservation and idempotent same-key retry. Conflicting keys are rejected.
- Mutates amount, currency, tier, status, and configured Price ID on separate orders before reservation, then verifies zero journal rows can be created using stale terms.
- Races two keys for one pending order across a PostgreSQL connection pool. Exactly one reservation must persist; losing key must fail; winning key may safely retry.
- Changes the amount on an already-reserved order and verifies that an idempotent retry can no longer be accepted under the original monetary terms.
- Added the test script to the preexisting `postgres-integration` job in `.github/workflows/healthwise-rebuild-tests.yml`. No paid infrastructure or external provider write is used.

## Evidence
- Previously **verified** successful run: GitHub Actions run `43613001135`, commit `8108de0`, with 174/174 tests and four successful jobs.
- The current branch head after the above integration-test changes is `2d475bf97f2ba71faba138a00490c348aec2d075`; the connected GitHub check and commit workflow lookup returned no qualifying run for that latest head. Therefore this new test is **committed and configured, but not yet certified passing**.
- Draft PR #1 remains open and unmerged.

## Release isolation
- v2 Healthwise sandbox products and prices remain inactive; the legacy Replit-targeting sandbox webhook remains disabled per the last provider read-back.
- No Stripe session, charge, product update, webhook change, public payment route, production database migration or deployment was performed.
- Release still requires the current CI run to pass; real disposable DB concurrency validation; provider-specific controlled sandbox test approval and completion; signed webhook + payment settlement integration; isolated production backup/PITR restore, migration/rollback, monitoring and explicit go-live approval.
