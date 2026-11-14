-- DESIGN ONLY. Disposable PostgreSQL tests; never migrate a persistent DB.
-- Append-only operator evidence for an uncertain Checkout dispatch.
-- This journal cannot release, retry, refund, or grant an entitlement.
BEGIN;

CREATE TABLE sandbox_checkout_review_evidence (
  evidence_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES sandbox_checkout_dispatch_ledger(order_id),
  request_sha256 char(64) NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_kind text NOT NULL CHECK (evidence_kind IN (
    'provider_lookup_incomplete','provider_session_observed',
    'provider_absence_unproven','manual_escalation'
  )),
  evidence_sha256 char(64) NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_by text NOT NULL CHECK (length(recorded_by) BETWEEN 3 AND 80),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id,evidence_kind,evidence_sha256)
);

CREATE FUNCTION healthwise_block_review_evidence_mutation()
RETURNS trigger LANGUAGE plpgsql AS $review_evidence_guard$
BEGIN
  RAISE EXCEPTION 'review_evidence_immutable' USING ERRCODE='23514';
END;
$review_evidence_guard$;

CREATE TRIGGER healthwise_review_evidence_immutable
BEFORE UPDATE OR DELETE ON sandbox_checkout_review_evidence
FOR EACH ROW EXECUTE FUNCTION healthwise_block_review_evidence_mutation();

COMMIT;
