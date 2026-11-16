/**
 * Engineering Vault only — PostgreSQL session lifecycle persistence.
 * Inject an isolated, separately privileged pool. Do not connect production.
 * Rotation revokes old and creates new in a SINGLE DB transaction/row lock.
 */
const SID=/^[A-Za-z0-9_-]{8,128}$/;
const SUBJECT=/^[A-Za-z0-9_-]{3,100}$/;
export function createPostgresVaultSessionStore({pool}={}){
 if(typeof pool?.connect!=="function")
  throw new TypeError("vault_session_store_pool_required");
 async function transaction(fn){
  const client=await pool.connect();
  let begun=false;
  try{
   await client.query("BEGIN");begun=true;
   const value=await fn(client);
   await client.query("COMMIT");begun=false;
   return value;
  }catch(error){
   if(begun)await client.query("ROLLBACK").catch(()=>{});
   throw error;
  }finally{client.release();}
 }
 function validSession({sessionId,subjectId,expiresAt}={}){
  return SID.test(sessionId??"") && SUBJECT.test(subjectId??"") &&
    expiresAt instanceof Date && Number.isFinite(expiresAt.getTime());
 }
 return Object.freeze({
  async createSession(row){
   if(!validSession(row)||row.revoked!==false)return false;
   return transaction(async client=>{
    const result=await client.query(
     "INSERT INTO vault_sessions(session_id,subject_id,revoked,expires_at) VALUES($1,$2,false,$3) ON CONFLICT(session_id) DO NOTHING RETURNING session_id",
     [row.sessionId,row.subjectId,row.expiresAt]
    );
    return result.rowCount===1;
   });
  },
  async rotateSession({oldSessionId,newSessionId,subjectId,expiresAt}={}){
   if(!SID.test(oldSessionId??"")||oldSessionId===newSessionId||
      !validSession({sessionId:newSessionId,subjectId,expiresAt}))return false;
   return transaction(async client=>{
    const old=await client.query(
     "UPDATE vault_sessions SET revoked=true WHERE session_id=$1 AND subject_id=$2 AND revoked=false AND expires_at>CURRENT_TIMESTAMP RETURNING session_id",
     [oldSessionId,subjectId]
    );
    if(old.rowCount!==1)return false;
    const inserted=await client.query(
     "INSERT INTO vault_sessions(session_id,subject_id,revoked,expires_at) VALUES($1,$2,false,$3) ON CONFLICT(session_id) DO NOTHING RETURNING session_id",
     [newSessionId,subjectId,expiresAt]
    );
    // Never commit old-session revocation if the new session fails to persist.
    if(inserted.rowCount!==1)throw new Error("vault_rotation_replacement_failed");
    return true;
   });
  },
  async revokeSession({sessionId}={}){
   if(!SID.test(sessionId??""))return false;
   return transaction(async client=>{
    const result=await client.query(
     "UPDATE vault_sessions SET revoked=true WHERE session_id=$1 AND revoked=false RETURNING session_id",
     [sessionId]
    );
    return result.rowCount===1;
   });
  }
 });
}
