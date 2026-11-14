import { HEALTHWISE_V2_SANDBOX_ACCOUNT } from "./stripe-v2-catalog.mjs";
import { verifyV2SandboxCheckoutPrice } from "./stripe-v2-price-preflight.mjs";

/**
 * Engineering-only read-only authorization gate BEFORE any Stripe Checkout
 * creation. Authenticates sandbox account and test mode via provider API and
 * verifies pinned product/price state. Does not create a Checkout session,
 * charge, webhook, or any other Stripe object.
 *
 * Call only from a future trusted server-side flow, never from the browser.
 */
export async function authorizeV2SandboxCheckoutPreflight({ stripe, tier }) {
  if (typeof stripe?.accounts?.retrieve !== "function" ||
      typeof stripe?.balance?.retrieve !== "function" ||
      typeof stripe?.prices?.retrieve !== "function" ||
      typeof stripe?.products?.retrieve !== "function") {
    throw new Error("stripe_readonly_client_required");
  }
  const account = await stripe.accounts.retrieve();
  if (!account || account.object !== "account" ||
      account.id !== HEALTHWISE_V2_SANDBOX_ACCOUNT) {
    throw new Error("stripe_sandbox_account_mismatch");
  }
  const balance = await stripe.balance.retrieve();
  if (!balance || balance.object !== "balance" || balance.livemode !== false) {
    throw new Error("stripe_test_mode_required");
  }
  // Assertion flags are constructed only here, following authenticated reads;
  // caller-provided flags are ignored. No public route invokes this module.
  const verifiedClient = {
    healthwiseVerifiedTestMode: true,
    healthwiseVerifiedAccountId: account.id,
    prices: stripe.prices,
    products: stripe.products
  };
  return verifyV2SandboxCheckoutPrice({
    stripe: verifiedClient,
    tier,
    stripeAccountId: account.id,
    livemode: false
  });
}
