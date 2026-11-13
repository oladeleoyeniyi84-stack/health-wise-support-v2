/**
 * Read-only inspection of an incomplete sandbox Checkout attempt.
 * This module NEVER retries Checkout creation or calls Stripe.
 *
 * An unbound attempt may correspond to a created Stripe session whose
 * response was lost. Even fresh attempts require provider-side review.
 */
export async function inspectSandboxCheckoutRecovery({ pool, orderId, now = new Date(), reviewAfterMs = 15 * 60 * 1000 }) {
  if (typeof pool?.query !== "function") throw new Error("pool_required");
  if (typeof orderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    throw new Error("invalid_order_id");
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) ||
      !Number.isSafeInteger(reviewAfterMs) || reviewAfterMs < 1 || reviewAfterMs > 86400000) {
    throw new Error("invalid_recovery_clock");
  }
  const result = await pool.query(
    `SELECT a.order_id, a.state, a.stripe_session_id, a.created_at,
            o.status AS order_status, o.stripe_session_id AS order_session_id
       FROM sandbox_checkout_attempts a
       JOIN consultation_orders o ON o.id = a.order_id
      WHERE a.order_id = $1`,
    [orderId]
  );
  if (result.rowCount !== 1 || !result.rows?.[0]) {
    throw new Error("attempt_not_found_or_ambiguous");
  }
  const record = result.rows[0];
  const createdAt = new Date(record.created_at);
  if (!Number.isFinite(createdAt.getTime()) ||
      createdAt.getTime() > now.getTime()) {
    return Object.freeze({ orderId, action: "manual_review", reason: "invalid_attempt_time" });
  }
  const ageMs = now.getTime() - createdAt.getTime();
  if (record.state === "bound" &&
      record.order_status === "pending" &&
      typeof record.stripe_session_id === "string" &&
      /^cs_test_[A-Za-z0-9]+$/.test(record.stripe_session_id) &&
      record.stripe_session_id === record.order_session_id) {
    return Object.freeze({ orderId, action: "bound", reason: "matching_persisted_sessions" });
  }
  if (record.state === "prepared" &&
      record.stripe_session_id == null &&
      record.order_session_id == null &&
      record.order_status === "pending") {
    return Object.freeze({
      orderId,
      action: ageMs >= reviewAfterMs ? "manual_review" : "provider_lookup_required",
      reason: ageMs >= reviewAfterMs ? "unresolved_attempt_age" : "ambiguous_provider_outcome"
    });
  }
  return Object.freeze({ orderId, action: "manual_review", reason: "inconsistent_order_attempt_state" });
}
