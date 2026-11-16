#!/usr/bin/env bash
# Disposable CI-only backup/restore exercise. Never use production credentials.
set -euo pipefail
: "${HEALTHWISE_ISOLATED_DB_ACK:?explicit acknowledgement required}"
[[ "$HEALTHWISE_ISOLATED_DB_ACK" == "YES_DISPOSABLE_DB" ]] || exit 2
: "${HEALTHWISE_TEST_DATABASE_URL:?missing disposable URL}"
: "${HEALTHWISE_RESTORE_DATABASE_URL:?missing disposable restore URL}"
[[ "$HEALTHWISE_TEST_DATABASE_URL" == "postgres://healthwise_test:disposable_ci_only@127.0.0.1:5432/healthwise_disposable" ]] || { echo 'source database must be the CI fixture'; exit 2; }
[[ "$HEALTHWISE_RESTORE_DATABASE_URL" == "postgres://healthwise_test:disposable_ci_only@127.0.0.1:5432/healthwise_restore_disposable" ]] || { echo 'restore database must be the CI fixture'; exit 2; }
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
src="$HEALTHWISE_TEST_DATABASE_URL"
dst="$HEALTHWISE_RESTORE_DATABASE_URL"
# The CI service starts with fresh databases. Create isolated schema and fixture.
psql "$src" -v ON_ERROR_STOP=1 -c 'CREATE SCHEMA hw_recovery_fixture'
# Apply the actual design migration in a dedicated schema, not a substitute fixture schema.
sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' db/001_foundation.sql > "$tmpdir/migration.sql"
{ printf 'SET search_path TO hw_recovery_fixture, public;\n'; cat "$tmpdir/migration.sql"; } | psql "$src" -v ON_ERROR_STOP=1
psql "$src" -v ON_ERROR_STOP=1 <<'SQL'
SET search_path TO hw_recovery_fixture, public;
INSERT INTO accounts(id,provider_subject) VALUES ('00000000-0000-4000-8000-000000000001','synthetic-recovery');
INSERT INTO consultation_orders(id,account_id,consultation_key,configured_price_id,currency,amount_minor,stripe_session_id,status)
 VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','quick','price_Recovery','usd',1500,'cs_test_Recovery','paid');
INSERT INTO provider_events(provider_event_id,event_type,outcome,order_id)
 VALUES ('evt_Recovery','checkout.session.completed','mark_paid','00000000-0000-4000-8000-000000000002');
INSERT INTO booking_entitlements(id,order_id,account_id,state)
 VALUES ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','ready');
SQL
docker run --rm --network host --user "$(id -u):$(id -g)" -v "$tmpdir:/backup" postgres:16-alpine pg_dump "$src" --format=custom --schema=hw_recovery_fixture --file=/backup/recovery.dump
docker run --rm --network host --user "$(id -u):$(id -g)" -v "$tmpdir:/backup:ro" postgres:16-alpine pg_restore --dbname="$dst" --exit-on-error --no-owner --no-privileges /backup/recovery.dump
# Confirm restored schema structure matches the backup source, not only row counts.
# Queries emit schema metadata only, never synthetic or customer records.
cat > "$tmpdir/schema-metadata.sql" <<'SQLMETA'
SELECT 'table:' || table_name
FROM information_schema.tables
WHERE table_schema='hw_recovery_fixture' AND table_type='BASE TABLE'
UNION ALL
SELECT 'column:' || table_name || ':' || ordinal_position || ':' ||
       column_name || ':' || data_type || ':' || is_nullable
FROM information_schema.columns
WHERE table_schema='hw_recovery_fixture'
UNION ALL
SELECT 'constraint:' || c.conrelid::regclass::text || ':' ||
       c.conname || ':' || pg_get_constraintdef(c.oid)
FROM pg_constraint c
JOIN pg_namespace n ON n.oid=c.connamespace
WHERE n.nspname='hw_recovery_fixture'
UNION ALL
SELECT 'index:' || tablename || ':' || indexname || ':' || indexdef
FROM pg_indexes WHERE schemaname='hw_recovery_fixture'
ORDER BY 1;
SQLMETA
psql "$src" -X -v ON_ERROR_STOP=1 -At -f "$tmpdir/schema-metadata.sql" > "$tmpdir/source-schema.txt"
psql "$dst" -X -v ON_ERROR_STOP=1 -At -f "$tmpdir/schema-metadata.sql" > "$tmpdir/restore-schema.txt"
if ! cmp -s "$tmpdir/source-schema.txt" "$tmpdir/restore-schema.txt"; then
  echo 'FAIL: restored schema metadata does not match backup source'
  exit 1
fi
psql "$dst" -v ON_ERROR_STOP=1 <<'SQL'
SET search_path TO hw_recovery_fixture, public;
DO $$
BEGIN
  IF (SELECT count(*) FROM accounts) <> 1
    OR (SELECT count(*) FROM consultation_orders WHERE status='paid') <> 1
    OR (SELECT count(*) FROM provider_events) <> 1
    OR (SELECT count(*) FROM booking_entitlements) <> 1 THEN
    RAISE EXCEPTION 'restore data integrity mismatch';
  END IF;
END $$;
-- Constraints must still work after restoration.
DO $$
BEGIN
  BEGIN
    INSERT INTO booking_entitlements(id,order_id,account_id) VALUES ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'duplicate entitlement unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO provider_events(provider_event_id,event_type,outcome,order_id) VALUES ('evt_BadForeignKey','test','ignore','00000000-0000-4000-8000-000000000099');
    RAISE EXCEPTION 'invalid foreign key unexpectedly accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;
SQL
# Rehearse a forward migration only inside a rolled-back transaction on
# the restored disposable database. No schema change may survive rollback.
sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' db/002_sandbox_checkout_attempts.sql > "$tmpdir/forward-migration.sql"
{
  printf 'BEGIN; SET LOCAL search_path TO hw_recovery_fixture, public;\n'
  cat "$tmpdir/forward-migration.sql"
  # Fail if the migration silently did nothing; SQL must see the new table
  # before the surrounding transaction is rolled back.
  cat <<'SQLCHECK'
DO $migration_check$
BEGIN
 IF to_regclass('hw_recovery_fixture.sandbox_checkout_attempts') IS NULL THEN
   RAISE EXCEPTION 'forward_migration_table_missing';
 END IF;
END $migration_check$;
SQLCHECK
  printf 'ROLLBACK;\n'
} | psql "$dst" -X -v ON_ERROR_STOP=1
# The migration was rolled back: no new table or modified metadata remains.
psql "$dst" -X -v ON_ERROR_STOP=1 -At -f "$tmpdir/schema-metadata.sql" > "$tmpdir/after-rollback-schema.txt"
if ! cmp -s "$tmpdir/restore-schema.txt" "$tmpdir/after-rollback-schema.txt"; then
  echo 'FAIL: rolled-back migration changed restored schema metadata'
  exit 1
fi
postrollback="$(psql "$dst" -X -v ON_ERROR_STOP=1 -At -c "SELECT to_regclass('hw_recovery_fixture.sandbox_checkout_attempts') IS NULL")"
[[ "$postrollback" == "t" ]] || { echo 'FAIL: migration table remained after rollback'; exit 1; }
# Confirm rollback did not modify the restored financial/entitlement fixture.
# Check only aggregate invariants; never emit customer records.
postrollback_data="$(psql "$dst" -X -v ON_ERROR_STOP=1 -At <<'SQLDATA'
SELECT
 (SELECT count(*) FROM hw_recovery_fixture.accounts)=1
 AND (SELECT count(*) FROM hw_recovery_fixture.consultation_orders WHERE status='paid' AND amount_minor=1500)=1
 AND (SELECT count(*) FROM hw_recovery_fixture.provider_events)=1
 AND (SELECT count(*) FROM hw_recovery_fixture.booking_entitlements WHERE state='ready')=1;
SQLDATA
)"
[[ "$postrollback_data" == "t" ]] || { echo 'FAIL: migration rollback altered restored transaction fixture'; exit 1; }
echo 'PASS: disposable forward migration executes and transaction rollback preserves restored schema'
echo 'PASS: disposable CI fixture backup and isolated restore preserve schema, indexes, constraints, synthetic rows, uniqueness, and foreign keys'
