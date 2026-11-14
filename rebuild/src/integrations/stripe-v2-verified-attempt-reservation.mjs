/**
 * Security-hardened journal reservation for the v2 Checkout preparation path.
 * Unlike the legacy generic reservation primitive, rechecks the WHOLE
 * monetary/order context atomically in PostgreSQL, not merely the Price ID.
 *
 * Never creates Checkout, calls Stripe, or grants a payment entitlement.
 */
export async function reserveVerifiedV2SandboxAttempt({
  pool, orderId, priceId, amountCents, currency, tier, idempotencyKey
}) {
  if (typeof pool?.query !== "function") throw new Error("pool_required");
  if (typeof orderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId))
    throw new Error("invalid_order_id");
  if (typeof priceId !== "string" || !/^price_[A-Za-z0-9]+$/.test(priceId))
    throw new Error("invalid_price_id");
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 ||
      currency !== "usd" || !["quick","full","premium"].includes(tier))
    throw new Error("invalid_amount_or_tier");
  if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey))
    throw new Error("invalid_idempotency_key");

  const values = [orderId, priceId, amountCents, currency, tier, idempotencyKey];
  // Single conditional INSERT. If amount, tier or currency changes during
  // the provider preflight, zero rows can be reserved for stale terms.
  const insert = await pool.query(
    `INSERT INTO sandbox_checkout_attempts(order_id, configured_price_id, idempotency_key)
     SELECT o.id, o.configured_price_id, $6
       FROM consultation_orders o
      WHERE o.id = $1
        AND o.configured_price_id = $2
        AND o.amount_minor = $3
        AND o.currency = $4
        AND o.consultation_key = $5
        AND o.status = 'pending'
        AND o.stripe_session_id IS NULL
     ON CONFLICT (order_id) DO NOTHING
     RETURNING order_id, configured_price_id, idempotency_key, state, stripe_session_id, created_at`,
    values
  );
  if (insert.rowCount !== 0 && insert.rowCount !== 1) throw new Error("attempt_ambiguous");
  if (insert.rowCount === 1) {
    const row=insert.rows?.[0];
    if (!row || String(row.order_id)!==orderId ||
        row.configured_price_id!==priceId ||
        row.idempotency_key!==idempotencyKey ||
        row.state!=="prepared" || row.stripe_session_id != null)
      throw new Error("checkout_attempt_conflict");
    return Object.freeze({orderId,priceId,idempotencyKey,state:"prepared",createdAt:row.created_at});
  }
  // A conditional INSERT returning nothing could mean a stale order OR an
  // existing attempt. Re-read current order and journal together; never
  // accept a retry when any monetary/order field changed.
  const observed=await pool.query(
    `SELECT o.id, o.status, o.configured_price_id, o.amount_minor,
            o.currency, o.consultation_key, o.stripe_session_id AS order_session,
            a.idempotency_key, a.state, a.stripe_session_id AS attempt_session,
            a.configured_price_id AS attempt_price, a.created_at
       FROM consultation_orders o
       JOIN sandbox_checkout_attempts a ON a.order_id = o.id
      WHERE o.id = $1`, [orderId]
  );
  if (observed.rowCount !== 1 || !observed.rows?.[0]) throw new Error("checkout_attempt_conflict");
  const r=observed.rows[0];
  if (String(r.id)!==orderId || r.status!=="pending" || r.order_session!=null ||
      r.configured_price_id!==priceId || Number(r.amount_minor)!==amountCents ||
      r.currency!==currency || r.consultation_key!==tier ||
      r.idempotency_key!==idempotencyKey || r.attempt_price!==priceId ||
      r.state!=="prepared" || r.attempt_session!=null)
    throw new Error("checkout_attempt_conflict");
  return Object.freeze({orderId,priceId,idempotencyKey,state:"prepared",createdAt:r.created_at});
}
