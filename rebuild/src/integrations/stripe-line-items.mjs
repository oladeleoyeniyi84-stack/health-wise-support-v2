/**
 * Server-side Stripe checkout line-item verification policy.
 * Call only with line items fetched from Stripe using a trusted SDK client.
 * Do not grant booking rights based on a browser redirect or client-supplied items.
 */
export function verifyCheckoutLineItems({ session, lineItems, order }) {
  if (!session || session.livemode !== false || typeof session.id !== "string" || !session.id.startsWith("cs_test_")) throw new Error("sandbox_session_required");
  if (!order || session.id !== order.stripeSessionId || !/^price_[A-Za-z0-9]+$/.test(order.configuredPriceId ?? "")) throw new Error("order_price_binding_required");
  if (session.payment_status !== "paid" || session.mode !== "payment") throw new Error("settled_payment_required");
  if (!Number.isSafeInteger(order.amountMinor) || order.amountMinor < 0 || !Number.isSafeInteger(session.amount_total) || session.amount_total !== order.amountMinor) throw new Error("amount_mismatch");
  if (typeof order.currency !== "string" || !/^[a-z]{3}$/i.test(order.currency) || session.currency?.toLowerCase() !== order.currency.toLowerCase()) throw new Error("currency_mismatch");
  if (!Array.isArray(lineItems) || lineItems.length !== 1 || lineItems[0]?.price?.id !== order.configuredPriceId || lineItems[0]?.quantity !== 1) throw new Error("line_item_mismatch");
  const item = lineItems[0];
  if (item.price?.active !== true || item.price?.currency?.toLowerCase() !== order.currency.toLowerCase()) throw new Error("price_inactive_or_currency_mismatch");
  if (!Number.isSafeInteger(item.amount_total) || item.amount_total !== order.amountMinor) throw new Error("line_item_amount_mismatch");
  return Object.freeze({ verified: true, sessionId: session.id, orderId: order.id });
}
