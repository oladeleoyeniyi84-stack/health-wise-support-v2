/**
 * ENGINEERING VAULT ONLY — internal server-owned PostgreSQL session reader.
 * The caller must inject a session identifier obtained from independently
 * authenticated server middleware. NEVER obtain it from a request parameter,
 * request body, unverified JWT, or client-declared verifiedByServer flag.
 *
 * This is NOT a session issuance or signature-verification implementation.
 * All queries are read-only and parameterized. Database failures fail closed.
 */
export function createTrustedPostgresAdminSessionDependencies({
  pool, getAuthenticatedSessionId, now=()=>new Date()
}={}) {
  if(typeof pool?.query!=="function" ||
     typeof getAuthenticatedSessionId!=="function" ||
     typeof now!=="function")
    throw new Error("trusted_admin_session_dependencies_required");

  const idPattern=/^[A-Za-z0-9_-]{8,128}$/;
  const operatorPattern=/^[A-Za-z0-9_-]{3,80}$/;
  const permission="healthwise.checkout.review_access.revoke";
  async function loadVerifiedServerSession(){
    const sessionId=await getAuthenticatedSessionId();
    if(typeof sessionId!=="string" || !idPattern.test(sessionId))
      throw new Error("review_admin_forbidden");
    const clock=now();
    if(!(clock instanceof Date) || !Number.isFinite(clock.getTime()))
      throw new Error("invalid_review_admin_clock");
    const found=await pool.query(
      "SELECT operator_id,revoked,expires_at FROM sandbox_review_sessions WHERE session_id=$1",
      [sessionId]
    );
    const record=found.rows?.[0];
    const expiry=record?.expires_at instanceof Date?record.expires_at.getTime():NaN;
    if(found.rowCount!==1 || !operatorPattern.test(record?.operator_id??"") ||
       record.revoked!==false || !Number.isFinite(expiry) || expiry<=clock.getTime())
      throw new Error("review_admin_forbidden");
    return Object.freeze({operatorId:record.operator_id,verifiedByServer:true,
      revoked:false,expiresAt:new Date(expiry)});
  }
  async function lookupActiveAdministratorGrant(operatorId){
    if(typeof operatorId!=="string" || !operatorPattern.test(operatorId))
      throw new Error("review_admin_forbidden");
    const found=await pool.query(
      "SELECT operator_id,permission,active FROM sandbox_review_admin_grants WHERE operator_id=$1 AND permission=$2",
      [operatorId,permission]
    );
    const grant=found.rows?.[0];
    if(found.rowCount!==1 || grant.operator_id!==operatorId ||
       grant.permission!==permission || grant.active!==true)
      throw new Error("review_admin_forbidden");
    return Object.freeze({operatorId,permission,active:true});
  }
  return Object.freeze({loadVerifiedServerSession,lookupActiveAdministratorGrant});
}
