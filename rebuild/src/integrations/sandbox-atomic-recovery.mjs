/**
 * Engineering-only transactional attachment of a verified cs_test_ session.
 * Caller MUST authenticate and verify provider session outside this module.
 * Never call Stripe, create sessions, or mount this on public routes.
 */
export async function bindRecoveredSandboxSession({ pool, orderId, sessionId, priceId, idempotencyKey }) {
  if (typeof pool?.connect !== "function") throw new Error("pool_required");
  if (typeof orderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) throw new Error("invalid_order_id");
  if (typeof sessionId !== "string" || !/^cs_test_[A-Za-z0-9]+$/.test(sessionId)) throw new Error("invalid_test_session");
  if (typeof priceId !== "string" || !/^price_[A-Za-z0-9]+$/.test(priceId)) throw new Error("invalid_price_id");
  if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) throw new Error("invalid_idempotency_key");

  const client = await pool.connect();
  let begun = false;
  try {
    await client.query("BEGIN");
    begun = true;
    // Lock order first, consistently, so concurrent recovery transactions serialize.
    const result = await client.query(
      `SELECT o.id, o.status, o.configured_price_id, o.stripe_session_id AS order_session_id,
              a.state, a.configured_price_id AS attempt_price_id,
              a.idempotency_key, a.stripe_session_id AS attempt_session_id
         FROM consultation_orders o
         JOIN sandbox_checkout_attempts a ON a.order_id = o.id
        WHERE o.id = $1
        FOR UPDATE OF o, a`,
      [orderId]
    );
    if (result.rowCount !== 1) throw new Error("recovery_binding_conflict");
    const r = result.rows[0];
    if (String(r.id) !== orderId || r.configured_price_id !== priceId ||
        r.attempt_price_id !== priceId || r.idempotency_key !== idempotencyKey ||
        r.status !== "pending") throw new Error("recovery_binding_conflict");

    const same = r.state === "bound" &&
      r.order_session_id === sessionId && r.attempt_session_id === sessionId;
    if (same) {
      await client.query("COMMIT");
      return Object.freeze({ orderId, sessionId, action: "already_bound" });
    }
    if (r.state !== "prepared" || r.order_session_id != null || r.attempt_session_id != null) {
      throw new Error("recovery_binding_conflict");
    }
    const orderUpdate = await client.query(
      `UPDATE consultation_orders
          SET stripe_session_id = $2, updated_at = now()
        WHERE id = $1 AND status = 'pending'
          AND configured_price_id = $3 AND stripe_session_id IS NULL
        RETURNING id`,
      [orderId, sessionId, priceId]
    );
    if (orderUpdate.rowCount !== 1) throw new Error("recovery_binding_conflict");
    const attemptUpdate = await client.query(
      `UPDATE sandbox_checkout_attempts
          SET state = 'bound', stripe_session_id = $2, updated_at = now()
        WHERE order_id = $1 AND state = 'prepared'
          AND configured_price_id = $3 AND idempotency_key = $4
          AND stripe_session_id IS NULL
        RETURNING order_id`,
      [orderId, sessionId, priceId, idempotencyKey]
    );
    if (attemptUpdate.rowCount !== 1) throw new Error("recovery_binding_conflict");
    await client.query("COMMIT");
    return Object.freeze({ orderId, sessionId, action: "bound" });
  } catch (error) {
    if (begun) {
      try { await client.query("ROLLBACK"); } catch { /* retain original error */ }
    }
    throw error;
  } finally {
    client.release();
  }
}
