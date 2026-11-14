-- DESIGN ONLY: disposable PostgreSQL engineering tests. NO PRODUCTION APPLY.
-- An irreversible local intent ledger, NOT an authorization to call Stripe.
-- The original attempt and the immutable full request are never overwritten.
BEGIN;

CREATE TABLE sandbox_checkout_dispatch_ledger (
  order_id uuid PRIMARY KEY REFERENCES sandbox_checkout_full_requests(order_id),
  request_sha256 char(64) NOT NULL CHECK(request_sha256 ~ '^[0-9a-f]{64}$'),
  state text NOT NULL CHECK(state IN ('outcome_uncertain','manual_review')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CHECK((state='outcome_uncertain' AND reviewed_at IS NULL) OR
        (state='manual_review' AND reviewed_at IS NOT NULL))
);

-- This table is append-only except for the one-way transition to manual
-- review. In particular NO reset to an unclaimed/dispatchable state.
CREATE FUNCTION healthwise_guard_dispatch_ledger()
RETURNS trigger LANGUAGE plpgsql AS $dispatch_guard$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'dispatch_ledger_delete_forbidden' USING ERRCODE='23514';
  END IF;
  IF NEW.order_id IS DISTINCT FROM OLD.order_id OR
     NEW.request_sha256 IS DISTINCT FROM OLD.request_sha256 OR
     NEW.claimed_at IS DISTINCT FROM OLD.claimed_at OR
     OLD.state<>'outcome_uncertain' OR NEW.state<>'manual_review' OR
     NEW.reviewed_at IS NULL THEN
    RAISE EXCEPTION 'dispatch_ledger_immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$dispatch_guard$;

CREATE TRIGGER healthwise_dispatch_ledger_guard
BEFORE UPDATE OR DELETE ON sandbox_checkout_dispatch_ledger
FOR EACH ROW EXECUTE FUNCTION healthwise_guard_dispatch_ledger();

COMMIT;
