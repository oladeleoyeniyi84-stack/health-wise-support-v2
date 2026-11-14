# Healthwise v2 — Prepared Checkout attempt age and manual-review gate

**2026-11-14 | Engineering Vault NO-GO | Zero new hosting expense**

## Reason for change
An existing `prepared` journal may reflect a Stripe Checkout create request whose response was lost. The private owner-bound reservation previously checked owner, status, amount, tier, currency and idempotency key, but it did not reject a stale journal before returning a reusable preparation receipt. Old or corrupted timestamps must not be treated as safe evidence of no provider session.

## Isolated implementation
- `rebuild/src/integrations/stripe-v2-prepared-attempt-age.mjs` is a pure validation helper. It rejects malformed timestamps, entries at least 15 minutes old and timestamps more than 5 seconds in the future. The 15-minute threshold is a conservative **application review threshold**, not a statement of Stripe idempotency retention or that a newer attempt is safe to send.
- `rebuild/src/integrations/stripe-v2-owner-bound-reservation.mjs` evaluates this age **before COMMIT while the order-row lock is held**. On rejection the transaction rolls back and returns `checkout_attempt_requires_review`. It never erases or rotates the journal key, creates Checkout or returns an entitlement.
- `rebuild/test/stripe-v2-prepared-attempt-age.test.mjs` covers age boundaries, clock skew, invalid timestamps and malformed clocks.
- The existing disposable PostgreSQL `postgres-v2-owner-bound-reservation.mjs` test now ages a synthetic reserved journal, verifies rejection on its original key and checks the exact row and original idempotency key remain intact.

## Safety limitations
A **fresh** journal is NOT permission to call or retry Stripe Checkout. Network loss may already have created a provider session even seconds ago. No live create coordinator is enabled, and the public preview route still returns 503. Any future provider operation requires verified API account and test mode, a durable immutable Checkout request snapshot, an externally approved idempotency/recovery protocol, Stripe-side read-only reconciliation and a dedicated signed webhook destination.

This change uses only GitHub source and existing ephemeral CI; no Stripe mutation, infrastructure purchase, permanent DB migration, public deployment or Replit operation was made.

## Verification and next gates
- Last user screenshot: run #283 passed at `58402f3`; this predates these changes.
- Current new commits require fresh CI verification, especially the disposable PostgreSQL owner-bound reservation job. Until its results are inspected, the new gate is **implemented but not certified**.
- After CI: check immutable request snapshot, stale/unknown provider outcome disposition, no blind retries, and isolated backup/restore evidence before seeking approval for a bounded real sandbox experiment.
