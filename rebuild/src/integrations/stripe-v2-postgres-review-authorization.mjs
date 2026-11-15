/**
 * Engineering Vault only: PostgreSQL serialization adapter for evidence writes.
 * The caller MUST provide a trusted server-authenticated session loader.
 * Revocation MUST use the same transaction advisory lock before mutation.
 * With useRowLocks=false, authorization is SELECT-only and safety depends on
 * every authorized mutation path honoring that lock; privileged bypasses
 * remain possible until a database-enforced mutation boundary is deployed.
 * No public route or Stripe calls.
 */
export function createPostgresLockedReviewAuthorization({pool,loadVerifiedServerSession,now=()=>new Date(),useRowLocks=true}={}){
 if(typeof pool?.connect!=="function" || typeof loadVerifiedServerSession!=="function" || typeof now!=="function" || typeof useRowLocks!=="boolean")
  throw new Error("review_auth_dependencies_required");
 return async function withLockedReviewAuthorization(callback){
  if(typeof callback!=="function")throw new Error("review_callback_required");
  const session=await loadVerifiedServerSession();
  if(session?.verifiedByServer!==true || typeof session?.sessionId!=="string" ||
     !/^[A-Za-z0-9_-]{8,128}$/.test(session.sessionId) ||
     typeof session?.operatorId!=="string" || !/^[A-Za-z0-9_-]{3,80}$/.test(session.operatorId))
   throw new Error("review_operator_forbidden");
  const client=await pool.connect();
  let begun=false;
  try{
   await client.query("BEGIN");begun=true;
   // Shared transaction advisory lock serializes with the admin revoker.
   // Legacy row locks remain the default. SELECT-only mode requires a
   // separately enforced mutation boundary before production use.
   await client.query("SELECT pg_advisory_xact_lock(720360, 1)");
   const lockClause=useRowLocks?" FOR UPDATE":"";
   const s=await client.query(
    "SELECT operator_id,revoked,expires_at FROM sandbox_review_sessions WHERE session_id=$1"+lockClause,
    [session.sessionId]);
   const g=await client.query(
    "SELECT active FROM sandbox_review_grants WHERE operator_id=$1 AND permission=$2"+lockClause,
    [session.operatorId,"healthwise.checkout.review_evidence"]);
   const clock=now();
   if(!(clock instanceof Date) || !Number.isFinite(clock.getTime()))
    throw new Error("invalid_review_auth_clock");
   const sr=s.rows?.[0],gr=g.rows?.[0];
   const expires=sr?.expires_at instanceof Date?sr.expires_at.getTime():NaN;
   if(s.rowCount!==1 || sr.operator_id!==session.operatorId ||
      sr.revoked!==false || !Number.isFinite(expires) || expires<=clock.getTime() ||
      g.rowCount!==1 || gr.active!==true)
    throw new Error("review_operator_forbidden");
   const operator=Object.freeze({id:session.operatorId,authenticated:true,
    permissions:Object.freeze(["healthwise.checkout.review_evidence"])});
   const result=await callback({client,operator});
   await client.query("COMMIT");begun=false;
   return result;
  }catch(error){
   if(begun)await client.query("ROLLBACK").catch(()=>{});
   throw error;
  }finally{client.release();}
 };
}
