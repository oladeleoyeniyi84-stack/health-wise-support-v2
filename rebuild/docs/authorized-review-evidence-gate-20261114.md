# Healthwise Support v2 — Authorized manual-review evidence gate

**2026-11-14 | Engineering Vault NO-GO | No Stripe, hosting or production changes**

## Verified baseline
Founder-provided GitHub Actions screenshot shows workflow run #323 green at commit `6d0f250` for the append-only evidence gate. New authorization work below has not yet been independently verified in CI.

## Security finding
The earlier low-level append-only review writer accepted a caller-controlled `recordedBy` identifier. A syntactically valid reviewer string was not proof of authentication or permission to view or record financial reconciliation evidence.

## Repair
- `rebuild/src/integrations/stripe-v2-review-evidence.mjs` now requires a `resolveOperator` callback supplied by a trusted server authentication integration. The resolver must return `authenticated:true`, a bounded operator ID, and an **array** containing the specific `healthwise.checkout.review_evidence` permission. Unsupported, missing, malformed or unprivileged reviewer context fails **before any SQL read/write**.
- The reviewer ID is derived exclusively from the authenticated resolver; a public request body must never supply the resolver or override its response.
- Existing unit regressions now use trusted synthetic reviewers. New negative tests reject unauthenticated reviewers, no permission, malformed identity, and missing resolver with zero DB calls. The disposable PostgreSQL evidence fixture now uses a synthetic authorized reviewer and continues verifying append-only and no-retry semantics.
- The evidence table, allowed categories, exact request hash constraints, immutability and deduplication remain unchanged. Provider discovery/reconciliation remains **read-only**. No refund, Checkout creation, retry, payout, or entitlement path is added.

## Remaining operational boundary
This is a **code-level authorization contract**, not proof of a deployed authentication or RBAC system. Before operational use, integrate a trusted server-side identity provider, verify service-to-service boundaries and short-lived sessions, document reviewer role assignment and revocation, enforce least-privilege database roles, and test horizontal privilege escalation. Never accept operator context serialized by an HTTP client. Separation of duties and retention of separately stored redacted evidence also require approval.

Provider lookup with no matching session, incomplete pagination or a network error **never proves absence** of an earlier Stripe Checkout request. The immutable dispatch record continues to prohibit automatic retry.

## Verification and release
Inspect newest GitHub Actions unit and PostgreSQL integration jobs for the exact latest SHA. Existing green #323 is the previous baseline. No persistent migration, production deployment, new cost, Stripe provider mutation, PR merge, or Replit operation.

**Engineering Vault: NO-GO.**
