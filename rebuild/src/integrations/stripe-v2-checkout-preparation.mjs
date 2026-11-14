import { authorizeV2SandboxCheckoutPreflight } from "./stripe-v2-checkout-authorization.mjs";
import { reserveSandboxCheckoutAttempt } from "./sandbox-checkout-attempts.mjs";

/**
 * Engineering-only pre-Checkout preparation. This function is intentionally
 * incapable of calling Stripe checkout.sessions.create or granting access.
 *
 * The intended flow is: read local pending order, independently verify Stripe
 * account+active pinned catalog, then durably reserve one immutable attempt.
 * Actual provider creation requires a separate, unimplemented release gate.
 */
export async function prepareV2SandboxCheckoutAttempt({ stripe, pool, orderId, idempotencyKey }) {
  if (typeof pool?.query !== "function") throw new Error("pool_required");
  if (typeof orderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) throw new Error("invalid_order_id");
  if (typeof idempotencyKey !== "string" ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) throw new Error("invalid_idempotency_key");

  const found = await pool.query(
    `SELECT id, consultation_key, configured_price_id, amount_minor,
            currency, status, stripe_session_id
       FROM consultation_orders WHERE id = $1`,
    [orderId]
  );
  if (found.rowCount !== 1 || !found.rows?.[0]) throw new Error("checkout_order_missing");
  const order = found.rows[0];
  if (String(order.id) !== orderId || order.status !== "pending" ||
      order.stripe_session_id != null) throw new Error("checkout_order_not_eligible");

  // Provider identity and active-price checks must succeed BEFORE a journal
  // reservation can be attempted. Inactive catalog fails with zero DB writes.
  const selected = await authorizeV2SandboxCheckoutPreflight({
    stripe, tier: order.consultation_key
  });
  if (selected.stripePriceId !== order.configured_price_id ||
      selected.amountCents !== Number(order.amount_minor) ||
      selected.currency !== order.currency) throw new Error("checkout_order_price_mismatch");

  // The SQL reservation independently checks pending status, current price,
  // and no bound session in case order state changes after initial SELECT.
  const attempt = await reserveSandboxCheckoutAttempt({
    pool, orderId, priceId: selected.stripePriceId, idempotencyKey
  });
  // This receipt is never a Checkout URL, entitlement or permission to call
  // Stripe. A prepared journal record may represent an uncertain attempt.
  return Object.freeze({
    action:"prepared_only", orderId, consultationKey: order.consultation_key,
    amountCents:selected.amountCents, currency:selected.currency,
    idempotencyKey:attempt.idempotencyKey
  });
}
