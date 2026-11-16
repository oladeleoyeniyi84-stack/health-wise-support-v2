/**
 * Engineering Vault only. The SQL reader runs on a restricted database
 * connection and exposes no HTTP endpoint or session issuance mechanism.
 */
const ID=/^[A-Za-z0-9_-]{8,128}$/;
export function createPostgresSessionRecordReader({pool}={}){
 if(typeof pool?.query!=="function")throw new TypeError("trusted_session_reader_pool_required");
 return async function loadSessionRecord(sessionId){
  if(typeof sessionId!=="string" || !ID.test(sessionId))return null;
  try{
   const result=await pool.query(
    "SELECT session_id,subject_id,revoked,expires_at FROM vault_sessions WHERE session_id=$1",
    [sessionId]
   );
   if(result.rowCount!==1)return null;
   const row=result.rows?.[0];
   if(!row || typeof row.session_id!=="string" ||
      typeof row.subject_id!=="string" || typeof row.revoked!=="boolean" ||
      !(row.expires_at instanceof Date))return null;
   return Object.freeze({sessionId:row.session_id,subjectId:row.subject_id,
     revoked:row.revoked,expiresAt:row.expires_at});
  }catch{return null;}
 };
}
