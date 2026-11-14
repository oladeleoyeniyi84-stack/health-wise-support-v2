import { createHash } from "node:crypto";
import { buildBlockedV2CheckoutRequest } from "./stripe-v2-blocked-checkout-request.mjs";

/**
 * This is a fingerprint of the *entire* blocked Stripe request, including
 * success/cancel URLs and idempotency options. Not a Checkout permission.
 */
export function makeV2FullCheckoutRequestFingerprint({
  snapshot, returnOrigin, approvedReturnOrigin
}) {
  const preview=buildBlockedV2CheckoutRequest({snapshot,returnOrigin,approvedReturnOrigin});
  const canonical=JSON.stringify({
    schemaVersion:1,snapshotSha256:preview.snapshotSha256,
    params:preview.params,options:preview.options
  });
  const sha256=createHash("sha256").update(canonical,"utf8").digest("hex");
  return Object.freeze({
    orderId:snapshot.terms.orderId,
    snapshotSha256:preview.snapshotSha256,
    requestSha256:sha256,
    successUrl:preview.params.success_url,
    cancelUrl:preview.params.cancel_url,
    action:"blocked_full_request_fingerprint",
    providerWriteAuthorized:false
  });
}

/**
 * Persists once, or exact-match retry, in isolated disposable PostgreSQL.
 * Re-derives all trusted terms and URLs. The insert is conditional on the
 * active pending order, prepared journal, and matching durable base snapshot.
 * No Stripe SDK methods or session creation.
 */
export async function persistV2FullCheckoutRequestFingerprint({
  pool, snapshot, returnOrigin, approvedReturnOrigin
}) {
  if(typeof pool?.query!=="function") throw new Error("snapshot_pool_required");
  const fp=makeV2FullCheckoutRequestFingerprint({snapshot,returnOrigin,approvedReturnOrigin});
  const t=snapshot.terms;
  const args=[
    t.orderId,t.ownerSubject,t.tier,t.stripePriceId,t.amountCents,
    t.currency,t.idempotencyKey,fp.snapshotSha256,fp.requestSha256,
    fp.successUrl,fp.cancelUrl
  ];
  const result=await pool.query(
    `INSERT INTO sandbox_checkout_full_requests
       (order_id,base_sha256,request_sha256,success_url,cancel_url)
     SELECT o.id,s.request_sha256,$9,$10,$11
       FROM consultation_orders o
       JOIN accounts a ON a.id=o.account_id
       JOIN sandbox_checkout_attempts j ON j.order_id=o.id
       JOIN sandbox_checkout_request_snapshots s ON s.order_id=o.id
      WHERE o.id=$1 AND a.provider_subject=$2
        AND o.consultation_key=$3 AND o.configured_price_id=$4
        AND o.amount_minor=$5 AND o.currency=$6
        AND o.status='pending' AND o.stripe_session_id IS NULL
        AND j.idempotency_key=$7 AND j.configured_price_id=$4
        AND j.state='prepared' AND j.stripe_session_id IS NULL
        AND s.idempotency_key=$7 AND s.owner_subject=$2
        AND s.configured_price_id=$4 AND s.amount_minor=$5 AND s.currency=$6
        AND s.request_sha256=$8
     ON CONFLICT (order_id) DO NOTHING
     RETURNING request_sha256`,args
  );
  if(result.rowCount===1 && result.rows?.[0]?.request_sha256===fp.requestSha256)
    return Object.freeze({action:"full_request_recorded",orderId:t.orderId,sha256:fp.requestSha256,release:"blocked"});
  if(result.rowCount!==0) throw new Error("full_request_conflict");
  const old=await pool.query(
    `SELECT f.request_sha256,f.base_sha256,f.success_url,f.cancel_url
       FROM sandbox_checkout_full_requests f
       JOIN consultation_orders o ON o.id=f.order_id
       JOIN accounts a ON a.id=o.account_id
       JOIN sandbox_checkout_attempts j ON j.order_id=o.id
       JOIN sandbox_checkout_request_snapshots s ON s.order_id=o.id
      WHERE f.order_id=$1 AND a.provider_subject=$2
        AND o.consultation_key=$3 AND o.configured_price_id=$4
        AND o.amount_minor=$5 AND o.currency=$6
        AND o.status='pending' AND o.stripe_session_id IS NULL
        AND j.idempotency_key=$7 AND j.configured_price_id=$4
        AND j.state='prepared' AND j.stripe_session_id IS NULL
        AND s.idempotency_key=$7 AND s.request_sha256=$8
        AND s.owner_subject=$2 AND s.configured_price_id=$4
        AND s.amount_minor=$5 AND s.currency=$6`,args.slice(0,8)
  );
  if(old.rowCount!==1 || !old.rows?.[0] ||
     old.rows[0].request_sha256!==fp.requestSha256 ||
     old.rows[0].base_sha256!==fp.snapshotSha256 ||
     old.rows[0].success_url!==fp.successUrl ||
     old.rows[0].cancel_url!==fp.cancelUrl)
    throw new Error("full_request_conflict");
  return Object.freeze({action:"full_request_already_recorded",orderId:t.orderId,sha256:fp.requestSha256,release:"blocked"});
}
