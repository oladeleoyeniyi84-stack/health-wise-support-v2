# Healthwise v2 — Checkout read-only preflight (2026-11-13)

**Engineering Vault: NO-GO.** No payment activation, Checkout session, webhook, production migration, Replit task or public deployment is authorized by this checkpoint.

## Grounded prior evidence
- Founder-approved GitHub protected Stripe workflow run 43504428461, attempt 2, confirmed test mode and exact account `acct_1T36fzDSAM5aSpF4` without API writes.
- Connected Stripe read-back confirmed new v2 sandbox products and prices inactive, legacy prices unchanged, zero Payment Links and the legacy Replit webhook disabled.
- The new dedicated v2 Price IDs remain scoped to quick, full and premium at $49, $99 and $199 (USD, one-time).

## Added code
- `rebuild/src/integrations/stripe-v2-price-preflight.mjs`: read-only selection gate. Requires exact account + livemode=false, independently account-verified injected client, GET price and product identity, amount/currency/type/metadata matching and **active product and active price**. Fails closed before returning a Checkout selection for the currently inactive objects.
- `rebuild/test/stripe-v2-price-preflight.test.mjs`: offline tests for inactive prices, account mismatch, wrong product/price, bad metadata, wrong amount, currency and missing provider client.
- No routes, external API writes, credentials or production wiring were added.

## Important trust boundary
The injected `healthwiseVerifiedTestMode` and `healthwiseVerifiedAccountId` attributes are **assertions from a trusted caller**, not intrinsically verified by Stripe SDK; a future authenticated server bootstrap must derive this evidence from Stripe's API, never the request body. Existing protected GitHub workflow confirms the key's sandbox identity but does not automatically authenticate a future running app process.

## Next controlled gates
1. Confirm CI passes for both new commits; do not claim unverified test counts.
2. Review separate legacy Calendly / Replit resources for potential duplicate booking or spending.
3. Design one-session sandbox test as a manually authorized experiment; activating the v2 test product/price and creating a session are both external writes requiring documented scope.
4. Add isolated durable order/session binding, explicit idempotency and authenticated webhook delivery verification before any public payment route.
5. Keep production release blocked until database restore, schema, monitoring and payment reconciliation gates pass.
