# Healthwise v2 — controlled Checkout preflight security gate

**Engineering Vault NO-GO — 2026-11-14.**

## Evidence baseline
- GitHub Actions run 43613001135 at commit 8108de0: 174 of 174 unit tests; all four jobs (unit, disposable PostgreSQL integration, synthetic backup/restore, Stripe SDK offline) passed. This does not prove production readiness.
- Independently re-read the connected Stripe sandbox account `acct_1T36fzDSAM5aSpF4`: three dedicated Healthwise v2 sandbox prices are **inactive**, and the single legacy Replit-targeting sandbox webhook is **disabled**. Legacy catalog prices remain active and unchanged. No provider writes were made in this review.

## New isolated implementation
- `rebuild/src/integrations/stripe-v2-checkout-authorization.mjs` performs Stripe account `retrieve` and balance `retrieve` (read-only), constructs internal authenticated test-mode assertions, and then calls `verifyV2SandboxCheckoutPrice` for exact pinned v2 Price ID, product, currency, amount, one-time type, and active-state validation.
- `rebuild/test/stripe-v2-checkout-authorization.test.mjs` adds offline regression coverage for inactive objects, wrong account, live-mode balance, legacy price, amount mismatch, invalid product and missing trusted provider API.
- Currently all v2 catalog objects remain inactive. Thus the authorization gate is expected to **fail closed** without enabling or creating a Checkout session.
- The new gate is **not connected** to `createSandboxCheckout`, a public HTTP handler, or any actual Stripe write endpoint. It cannot on its own authorize use of the older test Checkout adapter. An eventual controlled orchestrator must bind authenticated account context, journal attempt, pinned read-only selection and order context end-to-end.
- The new commit's CI execution has not yet been independently verified. The previously successful 174-test run applies to the earlier commit only.

## Still required before any isolated test-mode Checkout creation
1. Confirm latest CI success for new preflight tests.
2. Design a strict server-owned operation that durably reserves the attempt and validates the order and catalog before any provider write.
3. Check provider idempotency semantics, stable creation parameters, orphan discovery, duplicate-payment handling, and failure monitoring.
4. Review sandbox webhook endpoint/signed payload, settlement/reconciliation and refunds without enabling legacy Replit endpoint.
5. Obtain a specifically scoped authorization for any test-object activation and Checkout creation; never activate live payments or deploy production as a shortcut.
6. Preserve Engineering Vault NO-GO until production backup/PITR isolated restore, migrations/rollback, security and final approval gates are satisfied.
