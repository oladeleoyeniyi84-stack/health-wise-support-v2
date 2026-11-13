import { getVerifiedV2SandboxSelection } from "./stripe-v2-catalog.mjs";

/**
 * Read-only preflight for an isolated Healthwise v2 Stripe test-mode price.
 *
 * Caller must supply an authenticated, independently account-verified Stripe
 * client. This function never creates sessions, enables prices, or writes data.
 * Inactive v2 prices are intentionally rejected until separately activated.
 */
export async function verifyV2SandboxCheckoutPrice({ stripe, tier, stripeAccountId, livemode }) {
  const expected = getVerifiedV2SandboxSelection({ tier, stripeAccountId, livemode });
  if (stripe?.healthwiseVerifiedTestMode !== true ||
      stripe?.healthwiseVerifiedAccountId !== stripeAccountId) {
    throw new Error("unverified_stripe_account");
  }
  if (typeof stripe.prices?.retrieve !== "function" ||
      typeof stripe.products?.retrieve !== "function") {
    throw new Error("stripe_readonly_client_required");
  }

  // No API writes. Validate account-owned objects against the pinned catalog.
  const price = await stripe.prices.retrieve(expected.priceId);
  if (!price || price.id !== expected.priceId ||
      price.livemode !== false ||
      price.currency !== expected.currency ||
      price.type !== "one_time" ||
      price.unit_amount !== expected.amountCents ||
      price.product !== expected.productId ||
      price.metadata?.app !== "healthwise-v2" ||
      price.metadata?.tier !== tier) {
    throw new Error("v2_price_mismatch");
  }

  const product = await stripe.products.retrieve(expected.productId);
  if (!product || product.id !== expected.productId ||
      product.livemode !== false ||
      product.metadata?.app !== "healthwise-v2" ||
      product.metadata?.tier !== tier) {
    throw new Error("v2_product_mismatch");
  }

  // Fail closed before returning an eligible selection: today all v2 objects
  // are intentionally inactive; their activation is a separate release gate.
  if (price.active !== true || product.active !== true) {
    throw new Error("v2_catalog_inactive");
  }

  return Object.freeze({
    consultationKey: tier,
    stripePriceId: expected.priceId,
    amountCents: expected.amountCents,
    currency: expected.currency
  });
}
