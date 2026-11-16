/**
 * Engineering Vault only — PostgreSQL owner/read proof.
 * This is NOT HTTP authentication or an endpoint. The session identifier MUST
 * originate from separately authenticated server middleware, never a request
 * body, query, role header, or an unverified JWT.
 *
 * One SQL statement matches active session to record owner. The caller receives
 * only a boolean; no private record is returned by this preflight adapter.
 */
const ID=/^[A-Za-z0-9_-]{3,100}$/;
const SESSION=/^[A-Za-z0-9_-]{8,128}$/;

export function createPostgresOwnerReadProof({pool,getAuthenticatedSessionId}={}){
 if(typeof pool?.query!=="function" || typeof getAuthenticatedSessionId!=="function")
   throw new TypeError("trusted_owner_db_dependencies_required");
 return async function mayReadOwnedRecord({recordId}={}){
  if(typeof recordId!=="string" || !ID.test(recordId))
    return false;
  try{
   const sessionId=await getAuthenticatedSessionId();
   if(typeof sessionId!=="string" || !SESSION.test(sessionId))return false;
   const result=await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM vault_owned_records r
       JOIN vault_sessions s ON s.subject_id=r.owner_id
       WHERE r.record_id=$1 AND s.session_id=$2
         AND s.revoked=false AND s.expires_at > CURRENT_TIMESTAMP
     ) AS allowed`,[recordId,sessionId]
   );
   return result.rowCount===1 && result.rows?.[0]?.allowed===true;
  }catch{return false;}
 };
}
