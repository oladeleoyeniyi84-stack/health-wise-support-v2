# Healthwise v2 — Blocked Checkout request construction gate

**2026-11-14 | Engineering Vault NO-GO | Zero new infrastructure cost**

## Verified baseline
The user-provided GitHub Actions screenshot shows run #296 successful on commit `0519e33`, covering the immutable Checkout request snapshot and disposable PostgreSQL integration. The changes below postdate that run and need their own successful CI evidence.

## Implementation
- `rebuild/src/integrations/stripe-v2-blocked-checkout-request.mjs` builds a frozen, deterministic Stripe Checkout request preview from a verified pinned snapshot and a server-approved HTTPS origin. It re-derives the canonical snapshot hash, so altered owner, tier, account, price, amount, quantity, mode or idempotency key is rejected.
- The request preview contains only mode=payment, exactly one quantity of the pinned v2 price, the snapshot owner as client reference, pinned order/tier metadata, a fixed success path and cancel path, and the durable idempotency key.
- It returns `action:'blocked_request_preview'`, `providerWriteAuthorized:false` and `release:'blocked'`. It imports no Stripe SDK, invokes no provider method and is not mounted on a server.
- `rebuild/test/stripe-v2-blocked-checkout-request.test.mjs` adds regression coverage for exact request fields, deterministic replay, financial/identity tampering and untrusted/HTTP/legacy/local redirect origins.
- The older `stripe-sandbox.mjs` create adapter is still disconnected. Its caller-provided test-mode flag is not a sufficient authorization mechanism and it MUST NOT be attached to this preview.

## Outstanding security decisions
1. **The approved redirect origin is NOT included in the currently persisted snapshot hash.** Before any provider call, require a migration/review to persist an immutable digest of the entire provider request, including exact success/cancel URLs, or an equivalent locked final authorization contract. This test-only builder deliberately does not claim that gap is closed.
2. Before provider writes, verify actual authenticated Stripe test account and active catalog in the same trusted coordinator; enforce exact immutable principal, order lock, current journal and snapshot, provider request digest and idempotency key.
3. Crash/timeout between an external Stripe create call and session journal binding remains an uncertain outcome; forbid blind retry until read-only provider reconciliation is complete.
4. No hosted isolated HTTPS webhook, protected signing secret, actual test Checkout, production PITR restore, migration rollback or public deployment is authorized.
5. Last real Stripe read-back showed the three v2 prices inactive and Replit webhook disabled. No Stripe writes or paid infrastructure changes were made here.

## Verification
Latest new commit must receive successful GitHub Actions CI, particularly the unit job containing this request-preview test. The previous green #296 must not be misattributed to the new commits.

**Decision: BUILD/TEST ONLY. NO-GO for any real Stripe operation or publication.**
