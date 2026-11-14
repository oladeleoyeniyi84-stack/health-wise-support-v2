# Healthwise v2 — Trusted server-session reviewer authorization boundary

**2026-11-14 | Engineering Vault NO-GO | No infrastructure or Stripe changes**

## Prior verified baseline
The founder's GitHub Actions workflow screenshot confirms #328 green at commit `bcaa554`, covering the code-level reviewer permissions. The newer commits below require separate CI verification.

## New work
- `rebuild/src/integrations/stripe-v2-trusted-review-operator.mjs` adds a pure authentication/authorization adapter that obtains a **verified server-owned** session and consults an **independent active grant** for the exact `healthwise.checkout.review_evidence` permission. It rejects malformed identity, expired or revoked session, inactive grant, wrong operator, or unrelated permission, and returns only a frozen minimal reviewer context.
- `rebuild/test/stripe-v2-trusted-review-operator.test.mjs` covers accepted session/grant, negative access-control paths, browser-supplied `recordedBy` spoofing, and zero SQL operations when grant access is revoked.
- The disposable PostgreSQL `postgres-v2-full-request-fingerprint.mjs` evidence fixture now exercises the trusted resolver end-to-end with synthetic session and grant functions, preserving append-only and no-retry properties.
- The evidence writer still derives `recorded_by` exclusively from `resolveOperator`, never from an HTTP body. There is no public route, no payment creation, no provider mutation, and no entitlement operation.

## Critical limitations
A caller could fabricate `verifiedByServer:true` if a real HTTP handler ever accepted raw client claims. **This resolver is not itself a cryptographic session verifier.** A future deployment must inject `loadVerifiedServerSession` from validated middleware with server-side session storage or signature verification, correct issuer/audience, CSRF/session controls, revocation and enforced expiration; `lookupActiveReviewGrant` must query restricted server-owned authorization storage, not client-supplied roles. These dependencies are **not deployed or independently proven**.

The in-memory test grants are fixtures only. Operator provisioning, permission revocation races, identity provider integration, least-privilege DB roles, logging redaction, evidence retention and operational review workflow remain unverified. A successful CI run of synthetic tests does not establish production authorization readiness.

## Next
1. Verify latest CI unit and disposable PostgreSQL jobs at exact head SHA.
2. Review authentication middleware and restricted reviewer grant persistence in a future isolated environment.
3. Expand controlled, read-only Stripe reconciliation evidence classification, without ever interpreting no match as permission to retry.
4. Release remains gated by production PITR/restore, migration rollback, monitored isolated HTTPS, cost approval and founder release approval.

**No Stripe writes, test price activation, public deployment, infrastructure purchase, merge or Replit operation.**
