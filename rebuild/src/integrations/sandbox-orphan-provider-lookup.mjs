/**
 * Authenticate a potential orphan Checkout session by reading Stripe state.
 * Engineering only. No Checkout creation, payment capture or database writes.
 * The injected client MUST be initialized with the verified sandbox key,
 * and its account identity must come from an authenticated Stripe API call.
 */
export async function verifyOrphanSandboxSession({
  stripe, stripeAccountId, expectedAccountId,
  sessionId, orderId, userId, tier, priceId, amountCents, currency = "usd"
}) {
  if (stripeAccountId !== expectedAccountId || typeof expectedAccountId !== "string" ||
      !/^acct_[A-Za-z0-9]+$/.test(expectedAccountId) ||
      stripe?.healthwiseVerifiedTestMode !== true ||
      stripe?.healthwiseVerifiedAccountId !== expectedAccountId) {
    throw new Error("unverified_stripe_account");
  }
  if (typeof sessionId !== "string" || !/^cs_test_[A-Za-z0-9]+$/.test(sessionId)) throw new Error("invalid_test_session");
  if (typeof orderId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) throw new Error("invalid_order_id");
  if (typeof userId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(userId) ||
      !["quick", "full", "premium"].includes(tier) ||
      typeof priceId !== "string" || !/^price_[A-Za-z0-9]+$/.test(priceId) ||
      !Number.isSafeInteger(amountCents) || amountCents <= 0 || currency !== "usd") {
    throw new Error("invalid_expected_checkout");
  }
  if (typeof stripe.checkout?.sessions?.retrieve !== "function" ||
      typeof stripe.checkout?.sessions?.listLineItems !== "function") throw new Error("stripe_readonly_lookup_required");
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (!session || session.id !== sessionId || session.livemode !== false ||
      session.mode !== "payment" || session.client_reference_id !== userId ||
      session.metadata?.orderId !== orderId ||
      session.metadata?.consultationKey !== tier ||
      session.amount_total !== amountCents || session.currency !== currency ||
      !["open", "complete", "expired"].includes(session.status)) {
    throw new Error("orphan_session_mismatch");
  }
  const items = await stripe.checkout.sessions.listLineItems(sessionId, {
    limit: 2, expand: ["data.price"]
  });
  if (!items || items.has_more !== false || !Array.isArray(items.data) ||
      items.data.length !== 1 || items.data[0]?.quantity !== 1 ||
      items.data[0]?.price?.id !== priceId ||
      items.data[0]?.amount_total !== amountCents) {
    throw new Error("orphan_line_items_mismatch");
  }
  // Expired and completed sessions may need different business handling,
  // and this evidence by itself never grants a booking entitlement.
  return Object.freeze({ sessionId, orderId, priceId, status: session.status, verified: true });
}
