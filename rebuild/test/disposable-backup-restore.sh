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
sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' rebuild/db/001_foundation.sql > "$tmpdir/migration.sql"
{ printf 'SET search_path TO hw_recovery_fixture, public;\\n'; cat "$tmpdir/migration.sql"; } | psql "$src" -v ON_ERROR_STOP=1
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
pg_dump "$src" --format=custom --schema=hw_recovery_fixture --file="$tmpdir/recovery.dump"
pg_restore --dbname="$dst" --exit-on-error --no-owner --no-privileges "$tmpdir/recovery.dump"
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
echo 'PASS: disposable CI fixture backup and isolated restore preserve synthetic rows, uniqueness, and foreign keys'
