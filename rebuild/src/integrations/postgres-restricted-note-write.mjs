/**
 * Engineering Vault only — EXECUTE-only PostgreSQL note-write adapter.
 * Trusted, audited SECURITY DEFINER SQL routine must own all locks, grant
 * checks, ownership checks, and the mutation in one database statement.
 * DO NOT pass a client-provided session ID: caller is server-authenticated.
 */
const SESSION=/^[A-Za-z0-9_-]{8,128}$/;
const ID=/^[A-Za-z0-9_-]{3,100}$/;

export function createRestrictedNoteWriteExecutor({pool,getVerifiedSessionId}={}){
 if(typeof pool?.query!=="function" || typeof getVerifiedSessionId!=="function")
   throw new TypeError("vault_restricted_write_dependencies_required");
 return async function writeOwnedNote({recordId,note}={}){
  if(typeof recordId!=="string" || !ID.test(recordId) ||
     typeof note!=="string" || note.length>500)return false;
  let sessionId;
  try{sessionId=await getVerifiedSessionId();}
  catch{return false;}
  if(typeof sessionId!=="string" || !SESSION.test(sessionId))return false;
  try{
   const result=await pool.query(
    "SELECT vault_write_owned_note($1,$2,$3) AS allowed",
    [sessionId,recordId,note]
   );
   return result.rowCount===1 && result.rows?.[0]?.allowed===true;
  }catch{return false;}
 };
}
