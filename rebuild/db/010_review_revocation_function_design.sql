-- ENGINEERING VAULT / DISPOSABLE DATABASE ONLY.
-- Review before execution. Never apply this file to production as-is.
-- Assumes sandbox_review_sessions and sandbox_review_grants belong to the
-- dedicated trusted owner in the active schema; do not grant schema CREATE.
-- SECURITY DEFINER ownership and EXECUTE ACL must be audited at deployment.
--
-- This function only revokes; it cannot create, reactivate or broaden access.
-- Its caller must independently authenticate an authorized administrator.
-- No browser/user-controlled identity may be used as database authentication.
--
-- Deployment must REVOKE ALL ON FUNCTION from PUBLIC immediately within the
-- same transaction as CREATE, then GRANT EXECUTE only to the dedicated
-- non-superuser revoker LOGIN. The writer LOGIN must have no EXECUTE.
--
-- Intentionally fixed search_path; unqualified table references resolve to
-- the reviewed schema selected by the migration owner, not caller input.
CREATE OR REPLACE FUNCTION sandbox_revoke_review_access(
  p_operator_id text,
  p_session_id text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_sessions bigint;
  v_grants bigint;
BEGIN
  -- Fail closed: do not accept arbitrary identifiers or empty targets.
  IF p_operator_id IS NULL OR
     p_operator_id !~ '^[A-Za-z0-9_-]{3,80}$' OR
     (p_session_id IS NOT NULL AND
      p_session_id !~ '^[A-Za-z0-9_-]{8,128}$')
  THEN
    RAISE EXCEPTION 'invalid_revocation_request';
  END IF;

  -- All authorization readers and revokers must share this lock.
  PERFORM pg_catalog.pg_advisory_xact_lock(720360, 1);

  -- Replace REVIEWED_SCHEMA with a fixed, safely quoted schema identifier
  -- before execution. Never substitute from a request parameter.
  IF p_session_id IS NULL THEN
    UPDATE REVIEWED_SCHEMA.sandbox_review_sessions
       SET revoked = true WHERE operator_id = p_operator_id;
  ELSE
    UPDATE REVIEWED_SCHEMA.sandbox_review_sessions
       SET revoked = true
     WHERE operator_id = p_operator_id AND session_id = p_session_id;
  END IF;
  GET DIAGNOSTICS v_sessions = ROW_COUNT;

  UPDATE REVIEWED_SCHEMA.sandbox_review_grants
     SET active = false
   WHERE operator_id = p_operator_id
     AND permission = 'healthwise.checkout.review_evidence';
  GET DIAGNOSTICS v_grants = ROW_COUNT;

  IF v_grants <> 1 OR (p_session_id IS NOT NULL AND v_sessions <> 1) THEN
    RAISE EXCEPTION 'review_revocation_target_missing';
  END IF;
  RETURN true;
END;
$$;

-- Mandatory deployment steps (not executable here):
-- BEGIN; CREATE FUNCTION ...; REVOKE ALL ON FUNCTION ... FROM PUBLIC;
-- GRANT EXECUTE ... TO dedicated_revoker_login; COMMIT;
-- Ensure the function owner is NOLOGIN and has only the required table rights.
-- Verify dedicated_writer_login cannot invoke it and direct table writes fail.
-- NOTE: This is a review artifact, not a validated deployment migration.
