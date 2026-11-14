# Healthwise v2 — Private Checkout preparation coordinator (2026-11-14)

**Engineering Vault NO-GO. No real provider writes or activation.**

## Scope implemented
- `rebuild/src/integrations/stripe-v2-private-preparation-coordinator.mjs` is a private imported function, not a public endpoint. It accepts a trusted internal `resolvePrincipal` authentication callback, validates the stored order owner with `accounts.provider_subject`, and rejects missing/unauthenticated or mismatched owners before consulting Stripe.
- The coordinator derives the journal idempotency key with SHA-256 HMAC over the UUID order ID using an isolated server-side secret (minimum 32 UTF-8 bytes). It never accepts a user-provided key and does not return the key to the caller.
- Calls the existing read-only Stripe account/test-mode/active-price preflight and atomic monetary-context journal reservation. Its only result is `{action:'prepared_only', release:'blocked', ...}`; there is no Stripe Checkout creation call and no payment URL.
- New unit tests check inactive catalog refusal, owner mismatch, unauthenticated/malformed principal, server-secret validation, stable HMAC retry and absence of idempotency key in the result, and a blocked nonpending order.

## Important restrictions and gaps
- The current preview HTTP server remains 503 for booking and Checkout routes. Do not wire this module to a public route or any real Stripe operation.
- The authentication callback MUST come exclusively from trusted server middleware; a callback or authenticated flag derived from user body parameters would not be safe.
- The initial ownership SELECT and later conditional journal INSERT are separate queries. A privileged mutation to `consultation_orders.account_id` between them could violate ownership. **Before enabling Checkout**, make account ownership immutable for pending orders or recheck account ID/owner atomically in the final reservation transaction and enforce all provider parameters against the locked journal.
- The HMAC server secret must be generated and held in an isolated secret manager, not in source, logs or client-side code; secret rotation requires a designed reconciliation/migration for pending attempts because it changes keys.
- A previously reserved `prepared` journal does NOT prove a provider request was never sent. No blind retry is permitted without strict age and provider reconciliation.
- Account, provider SDK objects, and active catalog remain injected and engineering-only. The actual dedicated v2 sandbox prices are inactive, so real provider preflight will reject.
- The new code is not certified by CI until a successful GitHub Actions run on its exact commit is inspected.

## Next release gates
1. Independently confirm newest CI including the private coordinator unit tests.
2. Close the ownership TOCTOU gap and design final locked authorization/Checkout request snapshot with durable age and session creation uncertainty controls.
3. Deploy isolated *private test* webhook endpoint only after securing HTTPS hosting, signing secret and event allowlist, with no Replit reuse.
4. Separate explicit approval for activating any v2 test-only Stripe Price/Product, creating test Checkout and webhook objects. No public deployment or live payments.
5. Production PITR backup restoration, schema migration/rollback, runbooks, logging/alerts, final security approval and founder go-live approval remain open.
