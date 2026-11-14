# Healthwise v2 — Persistent reviewer authorization implementation gate

**2026-11-14 | Engineering Vault NO-GO | Design only — no production or Stripe mutations**

## Verified evidence
GitHub Actions run #335 succeeded at commit `1c71f45918cf403515e8c710de9875fb4339bbbc` with unit, disposable PostgreSQL integration, disposable restore, and offline Stripe SDK jobs green. These synthetic tests do not prove a deployed authentication system.

## Security boundary and intended integration
- Keep `createTrustedV2ReviewOperatorResolver` internal. Its `verifiedByServer` property is an adapter contract, **not** authentication proof.
- A trusted server-only middleware must authenticate a short-lived, revocable session from a server-managed session store or cryptographically verified credential. Validate issuer, audience, expiry, revocation and CSRF protection as applicable. Never derive trusted identity, grants or callback implementations from HTTP bodies, headers supplied by clients, or unverified JWT claims.
- Persist reviewer grants in restricted server-owned storage. The only accepted permission is `healthwise.checkout.review_evidence`; enforce active grant, exact operator match and audit-controlled assignment/revocation. Grant reads must not be cached across evidence writes without a defined revocation guarantee.
- Use least-privilege database roles. The evidence-writing principal must not create Stripe sessions, clear uncertainty, grant entitlements, mutate payments, or modify the immutable dispatch ledger.

## Race and atomicity risk
The current adapter checks grant status **before** the evidence INSERT. A revocation committed between the grant read and INSERT may allow a write that was authorized at the earlier instant. Unit tests for sequential revocation do **not** prove atomic revocation behavior. Before operational use, specify and test a transaction-level authorization invariant: acquire an appropriate row lock on the grant record in the same database transaction as the append-only evidence INSERT, with revocation using the same serialization discipline; or use a formally equivalent mechanism. Verify both transaction orderings with two PostgreSQL connections. Avoid holding locks during provider calls. If grants and evidence are stored in different systems, design and prove a bounded revocation policy before activation.

## Acceptance criteria for future isolated implementation
1. Unauthenticated, expired, revoked, malformed, wrong-audience and wrong-issuer sessions cannot invoke reviewer evidence writes.
2. Independent active permission grants are read from restricted persistence; missing or unavailable grant storage fails closed.
3. Two-connection concurrency tests demonstrate a documented serialization point for grant revocation versus evidence writes.
4. Authorized writes preserve append-only deduplication, immutable order ownership, blocked release and `retryAllowed:false`.
5. Operator IDs and review metadata are minimized and redacted in logs; retention and separation of duties are approved.
6. Synthetic CI is green at the exact proposed commit; operational identity and database access are reviewed separately.

## Explicit hold
No migration against persistent production data, public route, live Checkout, refund, entitlement, provider mutation, infrastructure spend, PR merge or release. Production PITR/isolated restore, rollback, durable storage, HTTPS monitoring, founder approval and cost review remain release gates.

**Engineering Vault: NO-GO.**
