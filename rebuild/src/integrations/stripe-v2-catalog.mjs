/**
 * Stripe Healthwise v2 sandbox catalog, independently verified 2026-11-13.
 * Public price IDs are identifiers, NOT API credentials.
 * Never use this catalog for live mode, and never expose it from preview HTTP.
 * All products/prices are currently inactive. No Checkout may be created.
 */
export const HEALTHWISE_V2_SANDBOX_ACCOUNT = "acct_1T36fzDSAM5aSpF4";
export const HEALTHWISE_V2_SANDBOX_CATALOG = Object.freeze({
  quick: Object.freeze({
    productId: "prod_VcgIQdrdphLJU9",
    priceId: "price_1UbQvoDSAM5aSpF4YcfIcscG",
    amountCents: 4900, currency: "usd", durationMinutes: 15
  }),
  full: Object.freeze({
    productId: "prod_VcgIqoyCE8gQNR",
    priceId: "price_1UbQvsDSAM5aSpF4dFOKCuVl",
    amountCents: 9900, currency: "usd", durationMinutes: 30
  }),
  premium: Object.freeze({
    productId: "prod_VcgITi8YWKS3TB",
    priceId: "price_1UbQvvDSAM5aSpF4cBcYrDI8",
    amountCents: 19900, currency: "usd", durationMinutes: 60
  })
});

export function getVerifiedV2SandboxSelection({ tier, stripeAccountId, livemode }) {
  if (livemode !== false || stripeAccountId !== HEALTHWISE_V2_SANDBOX_ACCOUNT) {
    throw new Error("stripe_sandbox_account_mismatch");
  }
  if (!Object.hasOwn(HEALTHWISE_V2_SANDBOX_CATALOG, tier)) {
    throw new Error("unknown_v2_tier");
  }
  // Returns only a reference. Does not activate an inactive Price or call Stripe.
  return HEALTHWISE_V2_SANDBOX_CATALOG[tier];
}
