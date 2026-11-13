# Healthwise v2 — read-only provider verification and atomic recovery checkpoint

**2026-11-13 | Engineering Vault: NO-GO | development branch only**

## Implemented
- `rebuild/src/integrations/sandbox-atomic-recovery.mjs`: one PostgreSQL transaction locks the order and attempt row, checks immutable order/price/idempotency identity, updates both records and commits together. A same-session retry is accepted only when both records already agree. A failure rolls back.
- `rebuild/test/sandbox-atomic-recovery.test.mjs`: offline transaction/rollback/conflict tests.
- Extended `rebuild/test/postgres-session-binding.mjs` to race two recovery bindings against disposable PostgreSQL, verify both records agree, and inject a failure in the second UPDATE to confirm the first is rolled back. The pre-existing GitHub Actions PostgreSQL integration job runs this script.
- `rebuild/src/integrations/sandbox-orphan-provider-lookup.mjs`: **read-only** injected Stripe SDK lookup of a specific test Checkout session and its line items, checking exact sandbox account assertion, order ID, user ID, tier, amount, currency and pinned Price ID. Expired/complete status is reported as evidence, never entitlement.
- `rebuild/test/sandbox-orphan-provider-lookup.test.mjs`: offline rejection tests for account/session/line-item mismatches.

## Trust and release barriers
- An authenticated server must itself derive Stripe account identity from the real API. The injected `healthwiseVerified*` properties are a **trusted-caller contract**, not cryptographic proof.
- No orchestrator yet connects provider verification to atomic database recovery; untrusted caller input must never directly invoke binding in production. The provider lookup accepts a **known session ID**, but does not discover unknown orphan IDs from Stripe. Discovery, timeout handling and crash injection across the provider boundary remain unresolved.
- A `prepared` attempt with no local session ID is ambiguous: it might already exist at Stripe. Do not automatically create a replacement using a new key.
- A verified provider session is not evidence of payment settlement. No booking entitlement is granted here.
- CI outcome for these new commits must be verified separately; do not infer success from earlier runs.
- Products and Price IDs are inactive; Replit sandbox webhook remains disabled; no application route, provider write, production migration or deployment was changed.
