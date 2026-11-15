/**
 * Engineering Vault only. Server-side administrative revocation for disposable
 * reviewer authorization records. The caller must authenticate/authorize the
 * administrator independently; never expose this function as a public route.
 *
 * UPDATE (never DELETE) takes the same PostgreSQL row locks as the evidence
 * authorization adapter, serializing revocation with in-flight writes.
 */
export async function revokeSandboxReviewerAccess({pool,operatorId,sessionId,permission="healthwise.checkout.review_evidence",authorizeAdministrator}={}){
 if(typeof pool?.connect!=="function" || typeof authorizeAdministrator!=="function")
  throw new Error("trusted_revocation_dependencies_required");
 if(typeof operatorId!=="string" || !/^[A-Za-z0-9_-]{3,80}$/.test(operatorId) ||
    (sessionId!==undefined && (typeof sessionId!=="string" || !/^[A-Za-z0-9_-]{8,128}$/.test(sessionId))) ||
    permission!=="healthwise.checkout.review_evidence")
  throw new Error("invalid_revocation_request");
 // The host's server-side administrative authorization must fail closed.
 const permitted=await authorizeAdministrator();
 if(permitted!==true)throw new Error("review_admin_forbidden");
 const client=await pool.connect();
 let begun=false;
 try{
  await client.query("BEGIN");begun=true;
  // Fixed lock order: session before grant, matching the evidence writer.
  let sessions;
  if(sessionId!==undefined){
   sessions=await client.query(
    "UPDATE sandbox_review_sessions SET revoked=true WHERE session_id=$1 AND operator_id=$2 RETURNING session_id",
    [sessionId,operatorId]);
  }else{
   sessions=await client.query(
    "UPDATE sandbox_review_sessions SET revoked=true WHERE operator_id=$1 RETURNING session_id",
    [operatorId]);
  }
  const grant=await client.query(
   "UPDATE sandbox_review_grants SET active=false WHERE operator_id=$1 AND permission=$2 RETURNING operator_id",
   [operatorId,permission]);
  if(grant.rowCount!==1 || (sessionId!==undefined && sessions.rowCount!==1))
   throw new Error("review_revocation_target_missing");
  await client.query("COMMIT");begun=false;
  return Object.freeze({action:"review_access_revoked",operatorId,release:"blocked",retryAllowed:false});
 }catch(error){
  if(begun)await client.query("ROLLBACK").catch(()=>{});
  throw error;
 }finally{client.release();}
}
