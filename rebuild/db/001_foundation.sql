-- Design-only migration. DO NOT APPLY TO PRODUCTION.
-- Requires a dedicated isolated PostgreSQL database and a reviewed migration runner.
BEGIN;
CREATE TABLE accounts (
  id uuid PRIMARY KEY,
  provider_subject text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);
CREATE TABLE consultation_orders (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  consultation_key text NOT NULL CHECK (consultation_key IN ('quick','full','premium')),
  configured_price_id text NOT NULL,
  currency char(3) NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  stripe_session_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','manual_review','refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE provider_events (
  provider_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  outcome text NOT NULL,
  order_id uuid REFERENCES consultation_orders(id)
);
CREATE TABLE booking_entitlements (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL UNIQUE REFERENCES consultation_orders(id),
  account_id uuid NOT NULL REFERENCES accounts(id),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','ready','redeemed','revoked')),
  booking_provider_ref text
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  actor_kind text NOT NULL,
  actor_ref text NOT NULL,
  action text NOT NULL,
  target_ref text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL,
  metadata_redacted jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX consultation_orders_account_created_idx ON consultation_orders(account_id,created_at DESC);
CREATE INDEX booking_entitlements_account_idx ON booking_entitlements(account_id);
COMMIT;
