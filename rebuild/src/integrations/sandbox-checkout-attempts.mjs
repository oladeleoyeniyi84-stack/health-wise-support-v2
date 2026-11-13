/**
 * Reserve one immutable test-mode Checkout attempt BEFORE contacting Stripe.
 * No provider calls, HTTP routes or payment activation here.
 *
 * A retry must reuse the same idempotency key and unchanged checkout inputs;
 * do not retry automatically after the provider's idempotency retention window.
 */
export async function reserveSandboxCheckoutAttempt({ pool, orderId, priceId, idempotencyKey }) {
  if (typeof pool?.query !== "function") throw new Error("pool_required");
  if (typeof orderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    throw new Error("invalid_order_id");
  }
  if (typeof priceId !== "string" || !/^price_[A-Za-z0-9]+$/.test(priceId)) {
    throw new Error("invalid_price_id");
  }
  if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
    throw new Error("invalid_idempotency_key");
  }
  const inserted = await pool.query(
    `INSERT INTO sandbox_checkout_attempts(order_id, configured_price_id, idempotency_key)
     SELECT id, configured_price_id, $3
       FROM consultation_orders
      WHERE id = $1 AND configured_price_id = $2
        AND status = 'pending' AND stripe_session_id IS NULL
     ON CONFLICT (order_id) DO NOTHING
     RETURNING order_id, configured_price_id, idempotency_key, state, stripe_session_id, created_at`,
    [orderId, priceId, idempotencyKey]
  );
  if (inserted.rowCount !== 0 && inserted.rowCount !== 1) throw new Error("attempt_ambiguous");
  const record = inserted.rowCount === 1 ? inserted.rows[0] :
    (await pool.query(
      "SELECT order_id, configured_price_id, idempotency_key, state, stripe_session_id, created_at FROM sandbox_checkout_attempts WHERE order_id = $1",
      [orderId]
    )).rows[0];
  if (!record ||
      String(record.order_id) !== orderId ||
      record.configured_price_id !== priceId ||
      record.idempotency_key !== idempotencyKey ||
      record.state !== "prepared" ||
      record.stripe_session_id != null) {
    throw new Error("checkout_attempt_conflict");
  }
  return Object.freeze({
    orderId, priceId, idempotencyKey, state: "prepared",
    // Age must be evaluated before any eventual provider retry; old/unknown
    // attempts require manual reconciliation, not blind Checkout re-creation.
    createdAt: record.created_at
  });
}
