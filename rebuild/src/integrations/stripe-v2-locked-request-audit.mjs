import { makeV2CheckoutRequestSnapshot } from "./stripe-v2-request-snapshot.mjs";
import { makeV2FullCheckoutRequestFingerprint } from "./stripe-v2-full-request-fingerprint.mjs";
import { assertFreshPreparedSandboxAttempt } from "./stripe-v2-prepared-attempt-age.mjs";

/**
 * PRIVATE, audit-only final consistency gate. It holds a PostgreSQL row lock
 * while verifying the owner, order, journal and BOTH immutable snapshots.
 * Neither a valid audit nor the returned digest authorizes Stripe creation.
 *
 * Caller must supply the authenticated server-owned principal and configured
 * HTTPS return origin. No Stripe SDK or network calls occur here.
 */
export async function auditLockedV2CheckoutRequest({
  pool, snapshot, expectedOwnerSubject, returnOrigin, approvedReturnOrigin,
  now = new Date()
}) {
  if(typeof pool?.connect!=="function") throw new Error("transactional_pool_required");
  if(!snapshot?.terms || typeof expectedOwnerSubject!=="string")
    throw new Error("checkout_snapshot_required");
  const t=snapshot.terms;
  const rebuilt=makeV2CheckoutRequestSnapshot({
    orderId:t.orderId,ownerSubject:t.ownerSubject,tier:t.tier,
    idempotencyKey:t.idempotencyKey
  });
  if(rebuilt.sha256!==snapshot.sha256 ||
     JSON.stringify(rebuilt.terms)!==JSON.stringify(t) ||
     expectedOwnerSubject!==t.ownerSubject)
    throw new Error("checkout_snapshot_integrity_mismatch");
  const full=makeV2FullCheckoutRequestFingerprint({
    snapshot,returnOrigin,approvedReturnOrigin
  });
  const client=await pool.connect();
  let transaction=false;
  try {
    await client.query("BEGIN");
    transaction=true;
    const result=await client.query(
      `SELECT o.id,o.status,o.stripe_session_id AS order_session,
              o.configured_price_id,o.amount_minor,o.currency,o.consultation_key,
              a.provider_subject,
              j.state AS attempt_state,j.stripe_session_id AS attempt_session,
              j.idempotency_key,j.configured_price_id AS attempt_price,j.created_at AS attempt_created_at,
              s.request_sha256 AS base_sha256,s.owner_subject AS snapshot_owner,
              s.configured_price_id AS snapshot_price,s.amount_minor AS snapshot_amount,
              s.currency AS snapshot_currency,s.idempotency_key AS snapshot_key,
              f.base_sha256 AS full_base_sha256,f.request_sha256 AS full_sha256,
              f.success_url,f.cancel_url
         FROM consultation_orders o
         JOIN accounts a ON a.id=o.account_id
         JOIN sandbox_checkout_attempts j ON j.order_id=o.id
         JOIN sandbox_checkout_request_snapshots s ON s.order_id=o.id
         JOIN sandbox_checkout_full_requests f ON f.order_id=o.id
        WHERE o.id=$1
        FOR UPDATE OF o`,[t.orderId]
    );
    const r=result.rows?.[0];
    if(result.rowCount!==1 || !r ||
       String(r.id)!==t.orderId || r.provider_subject!==t.ownerSubject ||
       r.status!=="pending" || r.order_session!=null ||
       r.configured_price_id!==t.stripePriceId ||
       Number(r.amount_minor)!==t.amountCents ||
       r.currency!==t.currency || r.consultation_key!==t.tier ||
       r.attempt_state!=="prepared" || r.attempt_session!=null ||
       r.idempotency_key!==t.idempotencyKey ||
       r.attempt_price!==t.stripePriceId ||
       r.base_sha256!==snapshot.sha256 ||
       r.snapshot_owner!==t.ownerSubject ||
       r.snapshot_price!==t.stripePriceId ||
       Number(r.snapshot_amount)!==t.amountCents ||
       r.snapshot_currency!==t.currency ||
       r.snapshot_key!==t.idempotencyKey ||
       r.full_base_sha256!==snapshot.sha256 ||
       r.full_sha256!==full.requestSha256 ||
       r.success_url!==full.successUrl ||
       r.cancel_url!==full.cancelUrl)
      throw new Error("locked_checkout_request_mismatch");
    assertFreshPreparedSandboxAttempt({createdAt:r.attempt_created_at,now});
    await client.query("COMMIT");
    return Object.freeze({
      action:"audit_verified_only",orderId:t.orderId,
      requestSha256:full.requestSha256,
      providerWriteAuthorized:false,release:"blocked"
    });
  } catch(error) {
    if(transaction) {
      try { await client.query("ROLLBACK"); } catch { /* preserve primary error */ }
    }
    throw error;
  } finally {
    client.release();
  }
}
