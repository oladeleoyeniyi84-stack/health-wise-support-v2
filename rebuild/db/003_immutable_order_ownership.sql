-- DESIGN ONLY. Apply solely to isolated disposable PostgreSQL tests until
-- production migration/rollback and identity governance are approved.
-- Prevent changing the original consultation-order owner, including after
-- checkout reservation, and forbid reassigning the owner's auth subject.
BEGIN;

CREATE FUNCTION healthwise_reject_order_owner_change()
RETURNS trigger LANGUAGE plpgsql AS $healthwise_owner_guard$
BEGIN
  IF NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    RAISE EXCEPTION 'consultation_order_owner_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$healthwise_owner_guard$;

CREATE TRIGGER healthwise_order_owner_immutable
BEFORE UPDATE OF account_id ON consultation_orders
FOR EACH ROW EXECUTE FUNCTION healthwise_reject_order_owner_change();

CREATE FUNCTION healthwise_reject_account_subject_change()
RETURNS trigger LANGUAGE plpgsql AS $healthwise_subject_guard$
BEGIN
  IF NEW.provider_subject IS DISTINCT FROM OLD.provider_subject THEN
    RAISE EXCEPTION 'account_subject_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$healthwise_subject_guard$;

CREATE TRIGGER healthwise_account_subject_immutable
BEFORE UPDATE OF provider_subject ON accounts
FOR EACH ROW EXECUTE FUNCTION healthwise_reject_account_subject_change();

COMMIT;
