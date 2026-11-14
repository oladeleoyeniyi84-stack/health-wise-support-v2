-- DESIGN ONLY: dedicated disposable database. NEVER APPLY TO PRODUCTION.
-- This is an additional immutable request-record safeguard; it grants no
-- permission to create a Checkout session and performs no provider writes.
BEGIN;

CREATE TABLE sandbox_checkout_request_snapshots (
  order_id uuid PRIMARY KEY REFERENCES consultation_orders(id),
  owner_subject text NOT NULL,
  configured_price_id text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL CHECK (currency = 'usd'),
  idempotency_key text NOT NULL UNIQUE,
  request_sha256 char(64) NOT NULL
    CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION healthwise_block_request_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $snapshot_guard$
BEGIN
  RAISE EXCEPTION 'checkout_request_snapshot_immutable' USING ERRCODE='23514';
END;
$snapshot_guard$;

CREATE TRIGGER healthwise_immutable_checkout_snapshot
BEFORE UPDATE OR DELETE ON sandbox_checkout_request_snapshots
FOR EACH ROW EXECUTE FUNCTION healthwise_block_request_snapshot_mutation();

COMMIT;
