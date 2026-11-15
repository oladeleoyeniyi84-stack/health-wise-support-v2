/**
 * Engineering Vault only. Atomic authorization boundary for review evidence.
 *
 * withLockedReviewAuthorization MUST acquire a DB transaction, lock the
 * server-owned session and permission-grant rows (or equivalent serialized
 * revocation state), verify both under the lock, and supply a transaction
 * client only while those locks remain held. Revocation must use the same
 * serialization mechanism. Never accept request-supplied identity or grants.
 *
 * This module does not implement the host's authentication or DB grant schema.
 * No payment, retry, entitlement, or provider action is performed here.
 */
export async function appendBlockedV2ReviewEvidenceAtomically({
  withLockedReviewAuthorization, orderId, requestSha256, evidenceKind, evidenceSha256
} = {}) {
  if (typeof withLockedReviewAuthorization !== "function")
    throw new Error("locked_review_authorization_required");
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const hash=/^[a-f0-9]{64}$/;
  const kinds=new Set(["provider_lookup_incomplete","provider_session_observed",
    "provider_absence_unproven","manual_escalation"]);
  if (!uuid.test(orderId ?? "") || !hash.test(requestSha256 ?? "") ||
      !hash.test(evidenceSha256 ?? "") || !kinds.has(evidenceKind))
    throw new Error("invalid_review_evidence");

  return withLockedReviewAuthorization(async ({client, operator}) => {
    if (typeof client?.query !== "function" ||
        operator?.authenticated !== true ||
        typeof operator?.id !== "string" ||
        !/^[A-Za-z0-9_-]{3,80}$/.test(operator.id) ||
        !Array.isArray(operator.permissions) ||
        !operator.permissions.includes("healthwise.checkout.review_evidence"))
      throw new Error("review_operator_forbidden");

    // The host must keep the authorization locks until this callback returns
    // and commit/rollback before allowing revocation to complete.
    const values=[orderId,requestSha256,evidenceKind,evidenceSha256,operator.id];
    const inserted=await client.query(
      `INSERT INTO sandbox_checkout_review_evidence
         (order_id,request_sha256,evidence_kind,evidence_sha256,recorded_by)
       SELECT d.order_id,d.request_sha256,$3,$4,$5
         FROM sandbox_checkout_dispatch_ledger d
        WHERE d.order_id=$1 AND d.request_sha256=$2
          AND d.state IN ('outcome_uncertain','manual_review')
       ON CONFLICT(order_id,evidence_kind,evidence_sha256) DO NOTHING
       RETURNING evidence_id`,values);
    if (inserted.rowCount===1 && inserted.rows?.[0]?.evidence_id!=null)
      return Object.freeze({action:"evidence_recorded",orderId,retryAllowed:false,release:"blocked"});
    if (inserted.rowCount!==0) throw new Error("review_evidence_conflict");
    const prior=await client.query(
      `SELECT e.evidence_id,e.recorded_by
         FROM sandbox_checkout_review_evidence e
         JOIN sandbox_checkout_dispatch_ledger d ON d.order_id=e.order_id
        WHERE e.order_id=$1 AND e.request_sha256=$2
          AND e.evidence_kind=$3 AND e.evidence_sha256=$4
          AND d.request_sha256=$2
          AND d.state IN ('outcome_uncertain','manual_review')`,values.slice(0,4));
    if (prior.rowCount!==1 || prior.rows?.[0]?.evidence_id==null ||
        prior.rows[0].recorded_by!==operator.id)
      throw new Error("review_evidence_conflict");
    return Object.freeze({action:"evidence_already_recorded",orderId,retryAllowed:false,release:"blocked"});
  });
}
