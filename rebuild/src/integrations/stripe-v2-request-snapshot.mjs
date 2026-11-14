import { createHash } from "node:crypto";
import { HEALTHWISE_V2_SANDBOX_ACCOUNT, getVerifiedV2SandboxSelection } from "./stripe-v2-catalog.mjs";

/**
 * Pure, deterministic test-only request snapshot. NO provider create and NO
 * redirect URLs. Only pinned catalog terms and trusted server-supplied owner.
 */
export function makeV2CheckoutRequestSnapshot({orderId,ownerSubject,tier,idempotencyKey}) {
  if(typeof orderId!=="string" ||
     !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId))
    throw new Error("invalid_order_id");
  if(typeof ownerSubject!=="string" || !/^[A-Za-z0-9_-]{1,80}$/.test(ownerSubject))
    throw new Error("invalid_owner_subject");
  if(typeof idempotencyKey!=="string" || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey))
    throw new Error("invalid_idempotency_key");
  const selection=getVerifiedV2SandboxSelection({
    tier,stripeAccountId:HEALTHWISE_V2_SANDBOX_ACCOUNT,livemode:false
  });
  const terms=Object.freeze({
    schemaVersion:1,mode:"payment",stripeAccountId:HEALTHWISE_V2_SANDBOX_ACCOUNT,
    livemode:false,orderId,ownerSubject,tier,
    stripePriceId:selection.priceId,amountCents:selection.amountCents,
    currency:selection.currency,quantity:1,idempotencyKey
  });
  const canonical=JSON.stringify(terms);
  const sha256=createHash("sha256").update(canonical,"utf8").digest("hex");
  return Object.freeze({terms,sha256});
}

/**
 * Atomic insert-or-match on a dedicated unique order PK. A prior immutable
 * snapshot is NEVER overwritten, including after conflicting retries.
 * No payment write or entitlement is possible through this function.
 */
export async function persistV2CheckoutRequestSnapshot({pool,snapshot}) {
  if(typeof pool?.query!=="function" || !snapshot?.terms ||
     typeof snapshot.sha256!=="string" || !/^[a-f0-9]{64}$/.test(snapshot.sha256))
    throw new Error("snapshot_dependencies_required");
  const recalc=makeV2CheckoutRequestSnapshot({
    orderId:snapshot.terms.orderId,ownerSubject:snapshot.terms.ownerSubject,
    tier:snapshot.terms.tier,idempotencyKey:snapshot.terms.idempotencyKey
  });
  if(recalc.sha256!==snapshot.sha256 || JSON.stringify(recalc.terms)!==JSON.stringify(snapshot.terms))
    throw new Error("snapshot_integrity_mismatch");
  const t=recalc.terms;
  const result=await pool.query(
    `INSERT INTO sandbox_checkout_request_snapshots
       (order_id,owner_subject,configured_price_id,amount_minor,currency,idempotency_key,request_sha256)
     SELECT o.id,a.provider_subject,o.configured_price_id,o.amount_minor,o.currency,$7,$8
       FROM consultation_orders o
       JOIN accounts a ON a.id=o.account_id
       JOIN sandbox_checkout_attempts j ON j.order_id=o.id
      WHERE o.id=$1 AND a.provider_subject=$2
        AND o.consultation_key=$3 AND o.configured_price_id=$4
        AND o.amount_minor=$5 AND o.currency=$6
        AND o.status='pending' AND o.stripe_session_id IS NULL
        AND j.configured_price_id=$4 AND j.idempotency_key=$7
        AND j.state='prepared' AND j.stripe_session_id IS NULL
     ON CONFLICT (order_id) DO NOTHING
     RETURNING request_sha256`,
    [t.orderId,t.ownerSubject,t.tier,t.stripePriceId,t.amountCents,t.currency,t.idempotencyKey,recalc.sha256]
  );
  if(result.rowCount===1 && result.rows?.[0]?.request_sha256===recalc.sha256)
    return Object.freeze({action:"snapshot_recorded",orderId:t.orderId,sha256:recalc.sha256});
  if(result.rowCount!==0)throw new Error("snapshot_conflict");
  const old=await pool.query(
    `SELECT s.request_sha256,s.owner_subject,s.configured_price_id,s.amount_minor,s.currency,s.idempotency_key
       FROM sandbox_checkout_request_snapshots s
       JOIN consultation_orders o ON o.id=s.order_id
       JOIN accounts a ON a.id=o.account_id
       JOIN sandbox_checkout_attempts j ON j.order_id=o.id
      WHERE s.order_id=$1 AND a.provider_subject=$2
        AND o.status='pending' AND o.stripe_session_id IS NULL
        AND o.consultation_key=$3 AND o.configured_price_id=$4
        AND o.amount_minor=$5 AND o.currency=$6
        AND j.idempotency_key=$7 AND j.configured_price_id=$4
        AND j.state='prepared' AND j.stripe_session_id IS NULL`,[t.orderId,t.ownerSubject,t.tier,t.stripePriceId,t.amountCents,t.currency,t.idempotencyKey]
  );
  if(old.rowCount!==1 || !old.rows?.[0] ||
     old.rows[0].request_sha256!==recalc.sha256 ||
     old.rows[0].owner_subject!==t.ownerSubject ||
     old.rows[0].configured_price_id!==t.stripePriceId ||
     Number(old.rows[0].amount_minor)!==t.amountCents ||
     old.rows[0].currency!==t.currency ||
     old.rows[0].idempotency_key!==t.idempotencyKey)
    throw new Error("snapshot_conflict");
  return Object.freeze({action:"snapshot_already_recorded",orderId:t.orderId,sha256:recalc.sha256});
}
