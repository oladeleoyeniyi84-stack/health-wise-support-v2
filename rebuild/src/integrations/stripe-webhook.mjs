import { evaluatePaymentEvent } from "../domain/payment-events.mjs";
import { verifyCheckoutLineItems } from "./stripe-line-items.mjs";

/**
 * Engineering-only signed sandbox webhook boundary, not an HTTP route.
 * Never trusts event-embedded line items or browser redirects.
 */
export async function processSandboxWebhook({ rawBody, signature, endpointSecret, stripe, repository }) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || rawBody.length > 262144) throw new Error("invalid_raw_body");
  if (typeof signature !== "string" || !signature || typeof endpointSecret !== "string" || !endpointSecret.startsWith("whsec_")) throw new Error("webhook_configuration_required");
  if (typeof stripe?.webhooks?.constructEvent !== "function" || typeof repository?.transaction !== "function") throw new Error("dependency_required");
  let event;
  try { event = stripe.webhooks.constructEvent(rawBody, signature, endpointSecret); }
  catch { throw new Error("invalid_webhook_signature"); }
  if (!event || event.livemode !== false || !/^evt_[A-Za-z0-9]+$/.test(event.id ?? "")) throw new Error("sandbox_event_required");
  return repository.transaction(async tx => {
    if (typeof tx.recordEventOnce !== "function" || typeof tx.lockOrderBySession !== "function" || typeof tx.applyDecision !== "function") throw new Error("transaction_contract_required");
    const isNew = await tx.recordEventOnce({ eventId: event.id, type: event.type });
    if (isNew === false) return Object.freeze({ action: "duplicate", eventId: event.id });
    if (isNew !== true) throw new Error("event_deduplication_unavailable");
    if (event.type !== "checkout.session.completed") {
      await tx.applyDecision({ action: "ignore", eventId: event.id });
      return Object.freeze({ action: "ignore", eventId: event.id });
    }
    const session = event.data?.object;
    if (!session || typeof session.id !== "string" || !session.id.startsWith("cs_test_")) throw new Error("invalid_test_session");
    const order = await tx.lockOrderBySession(session.id);
    if (!order) throw new Error("unknown_order");
    let decision = evaluatePaymentEvent({ signatureVerified: true, event, order });
    if (decision.action === "mark_paid" && (
      !Number.isSafeInteger(session.amount_total) ||
      !Number.isSafeInteger(order.amountMinor) ||
      session.amount_total !== order.amountMinor ||
      typeof session.currency !== "string" ||
      session.currency.toLowerCase() !== String(order.currency).toLowerCase() ||
      session.metadata?.consultationKey !== order.consultationKey
    )) decision = Object.freeze({ action: "manual_review", eventId: event.id });

    if (decision.action === "mark_paid") {
      // Fail closed when provider lookup or authoritative price binding is absent.
      if (typeof stripe?.checkout?.sessions?.listLineItems !== "function" ||
          !/^price_[A-Za-z0-9]+$/.test(order.configuredPriceId ?? "")) {
        decision = Object.freeze({ action: "manual_review", eventId: event.id });
      } else {
        try {
          const response = await stripe.checkout.sessions.listLineItems(session.id, { limit: 2, expand: ["data.price"] });
          // Two or more items, incomplete pagination, or missing provider fields fail closed.
          if (!response || response.has_more !== false) throw new Error("incomplete_line_items");
          verifyCheckoutLineItems({ session, lineItems: response.data, order });
        } catch {
          decision = Object.freeze({ action: "manual_review", eventId: event.id });
        }
      }
    }
    await tx.applyDecision({ ...decision, orderId: order.id });
    return decision;
  });
}
