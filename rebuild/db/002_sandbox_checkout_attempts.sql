-- DESIGN ONLY: DO NOT APPLY TO PRODUCTION.
-- Durable reservation BEFORE any externally authorized Stripe test-mode write.
-- Never infer that a Stripe session was NOT created merely because no local ID
-- has been persisted: network failure may leave an orphaned Stripe session.
BEGIN;
CREATE TABLE sandbox_checkout_attempts (
  order_id uuid PRIMARY KEY REFERENCES consultation_orders(id),
  configured_price_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'prepared'
    CHECK (state IN ('prepared', 'bound', 'manual_review')),
  stripe_session_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sandbox_checkout_attempts_state_created_idx
  ON sandbox_checkout_attempts(state, created_at);
COMMIT;
