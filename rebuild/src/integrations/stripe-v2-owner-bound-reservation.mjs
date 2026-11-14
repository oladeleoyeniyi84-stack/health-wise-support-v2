import { reserveVerifiedV2SandboxAttempt } from "./stripe-v2-verified-attempt-reservation.mjs";

/**
 * Owner-bound, transactional journal reservation for engineering-only v2.
 * The order row lock ensures account reassignment cannot interleave with
 * ownership verification and the journal INSERT.
 *
 * No Stripe write is made; a prepared attempt is NOT checkout permission.
 */
export async function reserveOwnerBoundV2SandboxAttempt({
  pool, orderId, priceId, amountCents, currency, tier,
  idempotencyKey, expectedOwnerSubject
}) {
  if (typeof pool?.connect !== "function") throw new Error("transactional_pool_required");
  if (typeof expectedOwnerSubject !== "string" ||
      expectedOwnerSubject.length < 1 || expectedOwnerSubject.length > 200)
    throw new Error("expected_owner_required");
  // Match the primitive's input constraints before opening a transaction.
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

  const client = await pool.connect();
  let started = false;
  try {
    await client.query("BEGIN");
    started = true;
    const locked = await client.query(
      `SELECT o.id, o.account_id, a.provider_subject, o.status,
              o.stripe_session_id, o.configured_price_id, o.amount_minor,
              o.currency, o.consultation_key
         FROM consultation_orders o
         JOIN accounts a ON a.id=o.account_id
        WHERE o.id=$1
        FOR UPDATE OF o`, [orderId]
    );
    if (locked.rowCount !== 1 || !locked.rows?.[0] ||
        String(locked.rows[0].id) !== orderId ||
        locked.rows[0].provider_subject !== expectedOwnerSubject)
      throw new Error("checkout_owner_mismatch");
    const o=locked.rows[0];
    if (o.status !== "pending" || o.stripe_session_id != null ||
        o.configured_price_id !== priceId ||
        Number(o.amount_minor) !== amountCents ||
        o.currency !== currency || o.consultation_key !== tier)
      throw new Error("checkout_attempt_conflict");

    // All reads/writes use this same transaction and hold the row lock.
    const attempt=await reserveVerifiedV2SandboxAttempt({
      pool:{query:(...args)=>client.query(...args)},
      orderId,priceId,amountCents,currency,tier,idempotencyKey
    });
    await client.query("COMMIT");
    return attempt;
  } catch(error) {
    if(started) {
      try { await client.query("ROLLBACK"); } catch { /* preserve primary error */ }
    }
    throw error;
  } finally {
    client.release();
  }
}
