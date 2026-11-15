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
-- Writer can only read server-owned authorization state and acquire row locks.
-- PostgreSQL SELECT ... FOR UPDATE requires UPDATE privilege on locked rows:
-- grant UPDATE only on non-identity lock columns; SQL UPDATE must be
-- blocked by a security-definer locking API or a separately reviewed RLS
-- policy. Until such an API exists, do NOT provision the writer role.
--
-- The admin role is intentionally NOT granted direct table mutation here.
-- Revoke operations must run through a separately authorized, audited,
-- SECURITY DEFINER procedure with a fixed search_path and reviewed owner.
-- No production role assignment is authorized by this design.
