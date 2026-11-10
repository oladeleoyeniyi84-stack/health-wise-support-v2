/**
 * Explicit test-mode Stripe checkout adapter.
 * Dependency injection keeps this module inert without a configured Stripe client.
 * This is not wired to a public route or production provider.
 */
export async function createSandboxCheckout({ stripe, order, selection, origin }) {
  if (!stripe || typeof stripe.checkout?.sessions?.create !== "function") throw new Error("stripe_client_required");
  if (!order || typeof order.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(order.id) || typeof order.userId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(order.userId)) throw new Error("invalid_order");
  if (!selection || selection.userId !== order.userId || selection.consultationKey !== order.consultationKey || !/^price_[A-Za-z0-9]+$/.test(selection.stripePriceId ?? "")) throw new Error("invalid_selection");
  if (typeof selection.idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(selection.idempotencyKey)) throw new Error("invalid_idempotency_key");
  if (order.status !== "pending" || order.stripeSessionId) throw new Error("order_not_pending");
  if (typeof origin !== "string" || !/^https:\/\/[a-z0-9.-]+(?::[0-9]{2,5})?$/i.test(origin)) throw new Error("invalid_origin");
  if (stripe._api?.auth && !String(stripe._api.auth).startsWith("sk_test_")) throw new Error("test_key_required");
  // The caller MUST verify a test-mode credential out of band. This flag
  // is intentionally mandatory and cannot be inferred from client internals.
  if (stripe.healthwiseVerifiedTestMode !== true) throw new Error("test_mode_not_verified");
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: selection.stripePriceId, quantity: 1 }],
    client_reference_id: order.userId,
    metadata: { orderId: order.id, consultationKey: order.consultationKey },
    success_url: origin + "/checkout/return?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: origin + "/consultations"
  }, { idempotencyKey: selection.idempotencyKey });
  if (!session || typeof session.id !== "string" || !session.id.startsWith("cs_test_")) throw new Error("non_test_session_rejected");
  return Object.freeze({ sessionId: session.id, checkoutUrl: session.url });
}
