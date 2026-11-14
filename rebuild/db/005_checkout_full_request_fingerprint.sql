-- DESIGN ONLY. APPLY TO DISPOSABLE POSTGRESQL TEST SCHEMAS ONLY.
-- One immutable complete Checkout request fingerprint per prepared order.
-- This neither enables nor authorizes Checkout creation.
BEGIN;
CREATE TABLE sandbox_checkout_full_requests (
  order_id uuid PRIMARY KEY REFERENCES sandbox_checkout_request_snapshots(order_id),
  base_sha256 char(64) NOT NULL CHECK (base_sha256 ~ '^[0-9a-f]{64}$'),
  request_sha256 char(64) NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  success_url text NOT NULL CHECK (length(success_url) <= 512),
  cancel_url text NOT NULL CHECK (length(cancel_url) <= 512),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION healthwise_block_full_request_mutation()
RETURNS trigger LANGUAGE plpgsql AS $full_request_guard$
BEGIN
  RAISE EXCEPTION 'checkout_full_request_immutable' USING ERRCODE='23514';
END;
$full_request_guard$;
CREATE TRIGGER healthwise_immutable_full_checkout_request
BEFORE UPDATE OR DELETE ON sandbox_checkout_full_requests
FOR EACH ROW EXECUTE FUNCTION healthwise_block_full_request_mutation();
COMMIT;
