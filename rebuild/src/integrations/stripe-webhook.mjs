import { evaluatePaymentEvent } from "../domain/payment-events.mjs";

/**
 * Signed webhook boundary, not an HTTP route. Dependency injection requires
 * a trusted Stripe SDK client and transactional repository implementation.
 * No network access, database writes, or payment actions occur on import.
 */
export async function processSandboxWebhook({ rawBody, signature, endpointSecret, stripe, repository }) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || rawBody.length > 262144) throw new Error("invalid_raw_body");
  if (typeof signature !== "string" || !signature || typeof endpointSecret !== "string" || !endpointSecret.startsWith("whsec_")) throw new Error("webhook_configuration_required");
  if (typeof stripe?.webhooks?.constructEvent !== "function" || typeof repository?.transaction !== "function") throw new Error("dependency_required");
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
  } catch {
    throw new Error("invalid_webhook_signature");
  }
  if (!event || event.livemode !== false || !/^evt_[A-Za-z0-9]+$/.test(event.id ?? "")) throw new Error("sandbox_event_required");
  return repository.transaction(async tx => {
    if (typeof tx.recordEventOnce !== "function" || typeof tx.lockOrderBySession !== "function" || typeof tx.applyDecision !== "function") throw new Error("transaction_contract_required");
    const isNew = await tx.recordEventOnce({ eventId: event.id, type: event.type });
    if (isNew === false) return Object.freeze({ action: "duplicate", eventId: event.id });
    if (isNew !== true) throw new Error("event_deduplication_unavailable");
    // Unrecognized events are recorded, not interpreted as paid orders.
    if (event.type !== "checkout.session.completed") {
      await tx.applyDecision({ action: "ignore", eventId: event.id });
      return Object.freeze({ action: "ignore", eventId: event.id });
    }
    const session = event.data?.object;
    if (!session || typeof session.id !== "string" || !session.id.startsWith("cs_test_")) throw new Error("invalid_test_session");
    const order = await tx.lockOrderBySession(session.id);
    if (!order) throw new Error("unknown_order");
    let decision = evaluatePaymentEvent({ signatureVerified: true, event, order });
    // Require provider financial details to match the stored authoritative order.
    if (decision.action === "mark_paid" && (
      !Number.isSafeInteger(session.amount_total) ||
      !Number.isSafeInteger(order.amountMinor) ||
      session.amount_total !== order.amountMinor ||
      typeof session.currency !== "string" ||
      session.currency.toLowerCase() !== String(order.currency).toLowerCase() ||
      session.metadata?.consultationKey !== order.consultationKey
    )) decision = Object.freeze({ action: "manual_review", eventId: event.id });
    await tx.applyDecision({ ...decision, orderId: order.id });
    return decision;
  });
}
