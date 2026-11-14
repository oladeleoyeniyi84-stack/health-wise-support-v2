import { makeV2CheckoutRequestSnapshot } from "./stripe-v2-request-snapshot.mjs";
import { makeV2FullCheckoutRequestFingerprint } from "./stripe-v2-full-request-fingerprint.mjs";
import { assertFreshPreparedSandboxAttempt } from "./stripe-v2-prepared-attempt-age.mjs";

/**
 * DB-ONLY safety rehearsal. Records the irreversible possibility of a Stripe
 * dispatch BEFORE any eventual provider interaction. No SDK/HTTP dependency,
 * no request body, no Checkout create, and NO permission to send one.
 *
 * Once recorded, concurrent / repeated claims are blocked forever; manual
 * review is not a reset. The order lock serializes owner and monetary checks.
 */
export async function claimBlockedV2CheckoutDispatch({
  pool,snapshot,expectedOwnerSubject,returnOrigin,approvedReturnOrigin,
  now=new Date()
}) {
  if(typeof pool?.connect!=="function")throw new Error("transactional_pool_required");
  if(!snapshot?.terms || typeof expectedOwnerSubject!=="string")
    throw new Error("checkout_snapshot_required");
  const t=snapshot.terms;
  const expected=makeV2CheckoutRequestSnapshot({
    orderId:t.orderId,ownerSubject:t.ownerSubject,tier:t.tier,
    idempotencyKey:t.idempotencyKey
  });
  if(expected.sha256!==snapshot.sha256 ||
     JSON.stringify(expected.terms)!==JSON.stringify(t) ||
     expectedOwnerSubject!==t.ownerSubject)
    throw new Error("checkout_snapshot_integrity_mismatch");
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw new Error("invalid_attempt_clock");
  const fp=makeV2FullCheckoutRequestFingerprint({
    snapshot,returnOrigin,approvedReturnOrigin
  });
  const client=await pool.connect();
  let begun=false;
  try{
    await client.query("BEGIN");
    begun=true;
    const q=await client.query(
      `SELECT o.id,o.status,o.stripe_session_id AS order_session,
              o.consultation_key,o.configured_price_id,o.amount_minor,o.currency,
              a.provider_subject,
              j.state AS journal_state,j.stripe_session_id AS journal_session,
              j.idempotency_key,j.configured_price_id AS journal_price,
              j.created_at AS journal_created,
              s.request_sha256 AS base_hash,s.owner_subject AS saved_owner,
              s.configured_price_id AS saved_price,s.amount_minor AS saved_amount,
              s.currency AS saved_currency,s.idempotency_key AS saved_key,
              f.base_sha256 AS full_base_hash,f.request_sha256 AS full_hash,
              f.success_url,f.cancel_url
         FROM consultation_orders o
         JOIN accounts a ON a.id=o.account_id
         JOIN sandbox_checkout_attempts j ON j.order_id=o.id
         JOIN sandbox_checkout_request_snapshots s ON s.order_id=o.id
         JOIN sandbox_checkout_full_requests f ON f.order_id=o.id
        WHERE o.id=$1 FOR UPDATE OF o`,[t.orderId]
    );
    const r=q.rows?.[0];
    if(q.rowCount!==1 || !r || String(r.id)!==t.orderId ||
       r.status!=="pending" || r.order_session!=null ||
       r.consultation_key!==t.tier ||
       r.configured_price_id!==t.stripePriceId ||
       Number(r.amount_minor)!==t.amountCents || r.currency!==t.currency ||
       r.provider_subject!==t.ownerSubject ||
       r.journal_state!=="prepared" || r.journal_session!=null ||
       r.idempotency_key!==t.idempotencyKey ||
       r.journal_price!==t.stripePriceId ||
       r.base_hash!==snapshot.sha256 ||
       r.saved_owner!==t.ownerSubject ||
       r.saved_price!==t.stripePriceId ||
       Number(r.saved_amount)!==t.amountCents ||
       r.saved_currency!==t.currency || r.saved_key!==t.idempotencyKey ||
       r.full_base_hash!==snapshot.sha256 ||
       r.full_hash!==fp.requestSha256 ||
       r.success_url!==fp.successUrl || r.cancel_url!==fp.cancelUrl)
      throw new Error("dispatch_context_mismatch");
    assertFreshPreparedSandboxAttempt({createdAt:r.journal_created,now});
    const inserted=await client.query(
      `INSERT INTO sandbox_checkout_dispatch_ledger(order_id,request_sha256,state)
         VALUES ($1,$2,'outcome_uncertain')
       ON CONFLICT(order_id) DO NOTHING
       RETURNING order_id`,[t.orderId,fp.requestSha256]
    );
    if(inserted.rowCount!==1 || String(inserted.rows?.[0]?.order_id)!==t.orderId)
      throw new Error("dispatch_already_claimed_requires_review");
    await client.query("COMMIT");
    begun=false;
    return Object.freeze({
      action:"outcome_uncertain_no_send",orderId:t.orderId,
      requestSha256:fp.requestSha256,providerWriteAuthorized:false,
      retryAllowed:false,release:"blocked"
    });
  }catch(error){
    if(begun){try{await client.query("ROLLBACK");}catch{}}
    throw error;
  }finally{client.release();}
}

/**
 * Read-only disposition. Never converts a missing session or a review
 * decision into permission to retry Checkout.
 */
export async function inspectBlockedV2Dispatch({pool,orderId}) {
  if(typeof pool?.query!=="function" ||
     typeof orderId!=="string" ||
     !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId))
    throw new Error("invalid_dispatch_inspection");
  const q=await pool.query(
    "SELECT state FROM sandbox_checkout_dispatch_ledger WHERE order_id=$1",[orderId]
  );
  if(q.rowCount!==1 || !["outcome_uncertain","manual_review"].includes(q.rows?.[0]?.state))
    return Object.freeze({action:"manual_review",reason:"missing_or_invalid_dispatch_record",retryAllowed:false});
  return Object.freeze({action:"manual_review",reason:q.rows[0].state,retryAllowed:false});
}
