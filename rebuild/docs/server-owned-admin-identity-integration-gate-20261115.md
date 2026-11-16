# Healthwise v2 — Server-Owned Administrator Identity Integration Gate

**Engineering Vault / NO-GO.** This is an isolated integration contract, not a production login system.

The new `stripe-v2-postgres-admin-session-dependencies.mjs` reads an existing server-owned session and an **independent**, exact-permission administrative grant. It is read-only and parameterized. It rejects missing, expired, revoked, malformed or unauthorized records. It is injected into `createTrustedReviewRevocationAuthorizer`.

## Required production wiring — NOT YET VERIFIED
1. An approved server authentication middleware must cryptographically verify or resolve the session, protect its cookie/token, enforce CSRF protection where applicable, and pass an **independently authenticated session identifier** to `getAuthenticatedSessionId`. Never pass raw request body, URL parameters, unverified JWT claims, or user-provided `verifiedByServer`.
2. Provision a separate table/permission store for `sandbox_review_admin_grants`, with a unique `(operator_id,permission)` constraint and controlled create/revoke paths. Never repurpose the reviewer evidence grant for administrator authority.
3. Use a restricted database connection with read-only access to sessions and administrator grants. Test actual service-role credentials, protected storage, expiry, revocation, rotation and failure behavior.
4. The administrator revocation entrypoint must use the trusted authorizer and **separate revoker-only DB role**; validate operation-specific authorization immediately before invoking the database mutation function, preserve audit logging and do not expose any public route during the Engineering Vault phase.
5. Confirm approval scope for session-specific revocation, since the current revocation SQL also disables the operator-wide grant.
6. Test the exact deployed authentication middleware and isolated HTTPS transport. No release until founder-approved staging and all seven gates pass.

Synthetic unit fixtures do not establish cryptographic verification, session-cookie controls, or production readiness. No Stripe, public routes, payment provider, production databases or credentials are changed.
