-- ENGINEERING VAULT DESIGN ONLY. Do not apply to production.
-- Requires schema owner / security administrator and separate login role
-- provisioning. These NOLOGIN roles must be mapped to distinct trusted
-- connection pools, never to browser credentials.
--
-- Replace sandbox schema/table ownership and search_path with a reviewed
-- deployment-specific plan. Do not grant CREATE on the schema to either role.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='healthwise_review_evidence_writer') THEN
  CREATE ROLE healthwise_review_evidence_writer NOLOGIN;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='healthwise_review_access_admin') THEN
  CREATE ROLE healthwise_review_access_admin NOLOGIN;
 END IF;
END $$;
REVOKE ALL ON sandbox_review_sessions FROM PUBLIC;
REVOKE ALL ON sandbox_review_grants FROM PUBLIC;
REVOKE ALL ON sandbox_review_sessions FROM healthwise_review_evidence_writer;
REVOKE ALL ON sandbox_review_grants FROM healthwise_review_evidence_writer;
REVOKE ALL ON sandbox_review_sessions FROM healthwise_review_access_admin;
REVOKE ALL ON sandbox_review_grants FROM healthwise_review_access_admin;
-- Writer is SELECT-only on authorization state. It must NOT receive
-- UPDATE/DELETE/INSERT or SELECT FOR UPDATE privileges on these tables.
-- The isolated adapter can use useRowLocks=false and takes
-- pg_advisory_xact_lock(720360,1) before reading authorization state.
-- Every authorized session/grant mutation MUST acquire the same advisory
-- transaction lock BEFORE touching these rows. A direct SQL UPDATE that
-- bypasses this protocol can invalidate the concurrency guarantee.
-- The current admin revocation adapter participates, but this design
-- does NOT yet enforce the protocol against all possible mutation paths.
-- No production writer role may be provisioned until a reviewed
-- SECURITY DEFINER mutation API (or equivalent enforceable database
-- boundary), dedicated DB login roles, privilege-negative tests, and
-- revocation race tests are verified. The advisory lock is cooperative,
-- not an independent database privilege boundary.
--
-- The admin role is intentionally NOT granted direct table mutation here.
-- Revoke operations must run through a separately authorized, audited,
-- SECURITY DEFINER procedure with a fixed search_path and reviewed owner.
-- No production role assignment is authorized by this design.
