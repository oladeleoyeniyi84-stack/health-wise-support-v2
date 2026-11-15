-- DESIGN ONLY: apply exclusively inside disposable isolated test schemas.
-- Host must populate sessions from authenticated server-side middleware.
-- Revocation must UPDATE these exact rows; DELETE must not be used for
-- revocation while relying on serialized session/grant state.
BEGIN;
CREATE TABLE sandbox_review_sessions (
 session_id text PRIMARY KEY CHECK (length(session_id) BETWEEN 8 AND 128),
 operator_id text NOT NULL CHECK (length(operator_id) BETWEEN 3 AND 80),
 revoked boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL
);
CREATE TABLE sandbox_review_grants (
 operator_id text NOT NULL CHECK (length(operator_id) BETWEEN 3 AND 80),
 permission text NOT NULL CHECK (permission='healthwise.checkout.review_evidence'),
 active boolean NOT NULL DEFAULT false,
 PRIMARY KEY(operator_id,permission)
);
COMMIT;
