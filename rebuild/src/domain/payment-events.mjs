/**
 * Webhook event state transition policy. This module does NOT verify signatures:
 * callers must verify the raw request body with the provider SDK first.
 * Never grant access based solely on redirect success or client-submitted status.
 */
export function evaluatePaymentEvent({ signatureVerified, event, order }) {
  if (signatureVerified !== true) throw new Error("signature_required");
  if (!event || typeof event.id !== "string" || !/^evt_[A-Za-z0-9]+$/.test(event.id)) throw new Error("invalid_event");
  if (!order || typeof order.id !== "string" || typeof order.userId !== "string") throw new Error("unknown_order");
  if (event.type !== "checkout.session.completed") return Object.freeze({ action: "ignore", eventId: event.id });
  const session = event.data?.object;
  if (!session || session.payment_status !== "paid" || session.mode !== "payment") return Object.freeze({ action: "manual_review", eventId: event.id });
  if (session.client_reference_id !== order.userId || session.metadata?.orderId !== order.id || session.id !== order.stripeSessionId) {
    return Object.freeze({ action: "manual_review", eventId: event.id });
  }
  if (order.status === "paid") return Object.freeze({ action: "ignore", eventId: event.id });
  if (order.status !== "pending") return Object.freeze({ action: "manual_review", eventId: event.id });
  return Object.freeze({ action: "mark_paid", eventId: event.id, orderId: order.id });
}
