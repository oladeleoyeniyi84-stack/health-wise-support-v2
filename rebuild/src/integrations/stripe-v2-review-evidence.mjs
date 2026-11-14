/**
 * Record minimal evidence metadata for manual review of a blocked v2
 * Checkout dispatch. No Stripe provider calls, session creation, retry,
 * clearing of uncertainty, or entitlement grants.
 *
 * evidenceSha256 is the digest of externally retained, access-controlled
 * review material, NOT proof that a provider request did or did not occur.
 */
export async function appendBlockedV2ReviewEvidence({
  pool,orderId,requestSha256,evidenceKind,evidenceSha256,recordedBy
}) {
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const hash=/^[a-f0-9]{64}$/;
  const kinds=new Set([
    "provider_lookup_incomplete","provider_session_observed",
    "provider_absence_unproven","manual_escalation"
  ]);
  if(typeof pool?.query!=="function")throw new Error("review_store_required");
  if(typeof orderId!=="string" || !uuid.test(orderId) ||
     typeof requestSha256!=="string" || !hash.test(requestSha256) ||
     typeof evidenceSha256!=="string" || !hash.test(evidenceSha256) ||
     !kinds.has(evidenceKind) ||
     typeof recordedBy!=="string" ||
     !/^[A-Za-z0-9_-]{3,80}$/.test(recordedBy))
    throw new Error("invalid_review_evidence");
  const values=[orderId,requestSha256,evidenceKind,evidenceSha256,recordedBy];
  const inserted=await pool.query(
    `INSERT INTO sandbox_checkout_review_evidence
       (order_id,request_sha256,evidence_kind,evidence_sha256,recorded_by)
     SELECT d.order_id,d.request_sha256,$3,$4,$5
       FROM sandbox_checkout_dispatch_ledger d
      WHERE d.order_id=$1 AND d.request_sha256=$2
        AND d.state IN ('outcome_uncertain','manual_review')
     ON CONFLICT(order_id,evidence_kind,evidence_sha256) DO NOTHING
     RETURNING evidence_id`,values
  );
  if(inserted.rowCount===1 && inserted.rows?.[0]?.evidence_id!=null)
    return Object.freeze({action:"evidence_recorded",orderId,retryAllowed:false,release:"blocked"});
  if(inserted.rowCount!==0)throw new Error("review_evidence_conflict");
  const prior=await pool.query(
    `SELECT e.evidence_id,e.recorded_by
       FROM sandbox_checkout_review_evidence e
       JOIN sandbox_checkout_dispatch_ledger d ON d.order_id=e.order_id
      WHERE e.order_id=$1 AND e.request_sha256=$2
        AND e.evidence_kind=$3 AND e.evidence_sha256=$4
        AND d.request_sha256=$2
        AND d.state IN ('outcome_uncertain','manual_review')`,values.slice(0,4)
  );
  if(prior.rowCount!==1 || prior.rows?.[0]?.evidence_id==null ||
     prior.rows[0].recorded_by!==recordedBy)
    throw new Error("review_evidence_conflict");
  return Object.freeze({action:"evidence_already_recorded",orderId,retryAllowed:false,release:"blocked"});
}
