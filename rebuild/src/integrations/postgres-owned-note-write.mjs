/**
 * Engineering Vault ONLY. Legacy direct-lock experiment; NOT RELEASE ELIGIBLE.
 * With a least-privileged role, PostgreSQL FOR UPDATE/SHARE needs UPDATE
 * privileges on session/grant tables; never grant those to make this pass.
 * Use postgres-restricted-note-write.mjs and its audited EXECUTE-only routine
 * for subsequent isolated experiments. This adapter is retained solely as a
 * denial regression and MUST NOT be wired to HTTP or production.
 * Never wire to a live pool or HTTP route. A caller supplies the session id
 * ONLY from independently authenticated server middleware, never the client.
 *
 * Lock ordering: session FOR UPDATE -> owned record FOR UPDATE -> grant FOR SHARE.
 * Revocation through UPDATE of the session/grant row therefore serializes
 * with this transaction; authorization and mutation are not separated by a
 * time-of-check/time-of-use window.
 */
const SESSION=/^[A-Za-z0-9_-]{8,128}$/;
const ID=/^[A-Za-z0-9_-]{3,100}$/;
const PERMISSION="healthwise.record.note.write";

export function createTransactionalOwnedNoteWriter({
  pool,getVerifiedSessionId
}={}){
 if(typeof pool?.connect!=="function" ||
    typeof getVerifiedSessionId!=="function")
   throw new TypeError("vault_write_dependencies_required");

 return async function updateOwnedNote({recordId,note}={}){
  if(typeof recordId!=="string" || !ID.test(recordId) ||
     typeof note!=="string" || note.length>500)return false;
  let sessionId;
  try{sessionId=await getVerifiedSessionId();}
  catch{return false;}
  if(typeof sessionId!=="string" || !SESSION.test(sessionId))return false;
  let client,started=false;
  try{
   client=await pool.connect();
   await client.query("BEGIN");started=true;
   const session=await client.query(
    "SELECT subject_id FROM vault_sessions WHERE session_id=$1 AND revoked=false AND expires_at>CURRENT_TIMESTAMP FOR UPDATE",
    [sessionId]
   );
   if(session.rowCount!==1 || typeof session.rows?.[0]?.subject_id!=="string")
     throw new Error("vault_write_denied");
   const subjectId=session.rows[0].subject_id;
   if(!ID.test(subjectId))throw new Error("vault_write_denied");

   const record=await client.query(
    "SELECT record_id FROM vault_owned_records WHERE record_id=$1 AND owner_id=$2 FOR UPDATE",
    [recordId,subjectId]
   );
   if(record.rowCount!==1)throw new Error("vault_write_denied");

   const grant=await client.query(
    "SELECT permission FROM vault_write_grants WHERE subject_id=$1 AND permission=$2 AND active=true FOR SHARE",
    [subjectId,PERMISSION]
   );
   if(grant.rowCount!==1 || grant.rows?.[0]?.permission!==PERMISSION)
     throw new Error("vault_write_denied");

   const changed=await client.query(
    "UPDATE vault_owned_records SET note=$3 WHERE record_id=$1 AND owner_id=$2 RETURNING record_id",
    [recordId,subjectId,note]
   );
   if(changed.rowCount!==1)throw new Error("vault_write_denied");
   await client.query("COMMIT");started=false;
   return true;
  }catch{
   if(client && started)await client.query("ROLLBACK").catch(()=>{});
   return false;
  }finally{
   if(client)client.release();
  }
 };
}
