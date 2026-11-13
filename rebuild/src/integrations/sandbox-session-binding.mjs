/**
 * Engineering-only atomic binding of a Stripe test Checkout session to a
 * pre-existing order in the isolated PostgreSQL consultation_orders table.
 *
 * This module never calls Stripe, creates an order, or mounts an HTTP route.
 * Caller must complete independently verified sandbox creation before binding.
 * A unique constraint on stripe_session_id protects session ownership.
 */
export async function bindSandboxCheckoutSession({ pool, orderId, sessionId, priceId }) {
  if (typeof pool?.query !== "function") throw new Error("pool_required");
  if (typeof orderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    throw new Error("invalid_order_id");
  }
  if (typeof sessionId !== "string" || !/^cs_test_[A-Za-z0-9]+$/.test(sessionId)) {
    throw new Error("invalid_test_session");
  }
  if (typeof priceId !== "string" || !/^price_[A-Za-z0-9]+$/.test(priceId)) {
    throw new Error("invalid_price_id");
  }

  // Exactly one SQL statement: no check-then-write race and no session reassignment.
  // The session column has a UNIQUE constraint in the design-only migration.
  const result = await pool.query(
    `UPDATE consultation_orders
       SET stripe_session_id = $2, updated_at = now()
     WHERE id = $1
       AND status = 'pending'
       AND configured_price_id = $3
       AND stripe_session_id IS NULL
     RETURNING id, stripe_session_id`,
    [orderId, sessionId, priceId]
  );
  if (result.rowCount === 1) {
    return Object.freeze({ orderId: String(result.rows[0].id), sessionId: result.rows[0].stripe_session_id, action: "bound" });
  }
  if (result.rowCount !== 0) throw new Error("binding_ambiguous");

  // Retried idempotent write may observe the already-bound same session.
  const current = await pool.query(
    "SELECT stripe_session_id, configured_price_id, status FROM consultation_orders WHERE id = $1",
    [orderId]
  );
  if (current.rowCount === 1 &&
      current.rows[0].stripe_session_id === sessionId &&
      current.rows[0].configured_price_id === priceId &&
      current.rows[0].status === "pending") {
    return Object.freeze({ orderId, sessionId, action: "already_bound" });
  }
  throw new Error("session_binding_conflict");
}
