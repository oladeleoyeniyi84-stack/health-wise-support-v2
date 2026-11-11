import { evaluatePaymentEvent } from "../domain/payment-events.mjs";
import { verifyCheckoutLineItems } from "./stripe-line-items.mjs";

/**
 * Two-stage, sandbox-only reconciliation prototype:
 * (1) read a non-locking snapshot, (2) fetch Stripe outside a transaction,
 * (3) atomically re-lock, re-check, deduplicate, and apply.
 *
 * This is NOT connected to an HTTP route and must not be used for production.
 */
export async function reconcileSandboxPayment({ event, stripe, repository }) {
  if (!event || event.livemode !== false || !/^evt_[A-Za-z0-9]+$/.test(event.id ?? "") || event.type !== "checkout.session.completed") throw new Error("sandbox_event_required");
  const session = event.data?.object;
  if (!session || !/^cs_test_[A-Za-z0-9]+$/.test(session.id ?? "")) throw new Error("sandbox_session_required");
  if (typeof repository?.findOrderBySession !== "function" || typeof repository?.transaction !== "function") throw new Error("repository_required");
  const snapshot = await repository.findOrderBySession(session.id);
  if (!snapshot) throw new Error("unknown_order");
  let verified = false;
  try {
    if (typeof stripe?.checkout?.sessions?.listLineItems !== "function") throw new Error("stripe_lookup_required");
    const response = await stripe.checkout.sessions.listLineItems(session.id, { limit: 2, expand: ["data.price"] });
    if (!response || response.has_more !== false) throw new Error("incomplete_items");
    verifyCheckoutLineItems({ session, lineItems: response.data, order: snapshot });
    verified = true;
  } catch {
    verified = false;
  }
  return repository.transaction(async tx => {
    const fresh = await tx.lockOrderBySession(session.id);
    if (!fresh) throw new Error("unknown_order");
    if (typeof tx.recordEventOnce !== "function" || typeof tx.applyDecision !== "function") throw new Error("transaction_contract_required");
    const inserted = await tx.recordEventOnce({ eventId: event.id, type: event.type });
    if (inserted === false) return Object.freeze({ action: "duplicate", eventId: event.id });
    if (inserted !== true) throw new Error("deduplication_unavailable");
    let decision = evaluatePaymentEvent({ signatureVerified: true, event, order: fresh });
    const sameBinding = fresh.id === snapshot.id &&
      fresh.status === snapshot.status &&
      fresh.stripeSessionId === snapshot.stripeSessionId &&
      fresh.userId === snapshot.userId &&
      fresh.configuredPriceId === snapshot.configuredPriceId &&
      fresh.amountMinor === snapshot.amountMinor &&
      fresh.currency === snapshot.currency &&
      fresh.consultationKey === snapshot.consultationKey;
    if (decision.action === "mark_paid" && (!verified || !sameBinding ||
      session.amount_total !== fresh.amountMinor ||
      session.currency?.toLowerCase() !== fresh.currency?.toLowerCase() ||
      session.metadata?.consultationKey !== fresh.consultationKey)) {
      decision = Object.freeze({ action: "manual_review", eventId: event.id });
    }
    await tx.applyDecision({ ...decision, orderId: fresh.id });
    return decision;
  });
}
