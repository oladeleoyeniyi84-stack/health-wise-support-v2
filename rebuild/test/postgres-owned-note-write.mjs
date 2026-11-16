/** Disposable PostgreSQL only. Requires the guarded CI ephemeral database. */
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {Pool} from "pg";
import {assertDisposableDatabase} from "./support/disposable-db-guard.mjs";
import {createTransactionalOwnedNoteWriter}
 from "../src/integrations/postgres-owned-note-write.mjs";

const url=assertDisposableDatabase({
 url:process.env.HEALTHWISE_TEST_DATABASE_URL,
 ack:process.env.HEALTHWISE_ISOLATED_DB_ACK
});
const suffix=randomBytes(5).toString("hex");
const schema="hw_write_"+suffix,readerRole="hw_writer_"+suffix;
const q=s=>'"'+s.replaceAll('"','""')+'"';
const password=randomBytes(24).toString("hex");
const owner="member_001",other="member_002";
const session="session_owner_"+suffix,otherSession="session_other_"+suffix;
const record="record_owner",foreign="record_foreign";
const admin=new Pool({connectionString:url,max:3,connectionTimeoutMillis:3000});
let schemaMade=false,roleMade=false,writer;
try{
 await admin.query("CREATE ROLE "+q(readerRole)+" LOGIN PASSWORD '"+password+"'");roleMade=true;
 await admin.query("CREATE SCHEMA "+q(schema));schemaMade=true;
 await admin.query("CREATE TABLE "+q(schema)+".vault_sessions(session_id text PRIMARY KEY, subject_id text NOT NULL, revoked boolean NOT NULL, expires_at timestamptz NOT NULL)");
 await admin.query("CREATE TABLE "+q(schema)+".vault_owned_records(record_id text PRIMARY KEY,owner_id text NOT NULL,note text NOT NULL DEFAULT '')");
 await admin.query("CREATE TABLE "+q(schema)+".vault_write_grants(subject_id text NOT NULL,permission text NOT NULL,active boolean NOT NULL,PRIMARY KEY(subject_id,permission))");
 await admin.query("INSERT INTO "+q(schema)+".vault_sessions VALUES ($1,$2,false,now()+interval '1 hour'),($3,$4,false,now()+interval '1 hour')",[session,owner,otherSession,other]);
 await admin.query("INSERT INTO "+q(schema)+".vault_owned_records(record_id,owner_id) VALUES ($1,$2),($3,$4)",[record,owner,foreign,other]);
 const perm="healthwise.record.note.write";
 await admin.query("INSERT INTO "+q(schema)+".vault_write_grants VALUES ($1,$3,true),($2,$3,true)",[owner,other,perm]);
 await admin.query("GRANT USAGE ON SCHEMA "+q(schema)+" TO "+q(readerRole));
 await admin.query("GRANT SELECT ON "+q(schema)+".vault_sessions,"+q(schema)+".vault_write_grants TO "+q(readerRole));
 await admin.query("GRANT SELECT(record_id,owner_id),UPDATE(note) ON "+q(schema)+".vault_owned_records TO "+q(readerRole));
 const writerUrl=new URL(url);writerUrl.username=readerRole;writerUrl.password=password;
 writer=new Pool({connectionString:writerUrl.toString(),max:3,
  options:"-c search_path="+schema,connectionTimeoutMillis:3000});
 const ident=await writer.query("SELECT current_user,rolsuper FROM pg_roles WHERE rolname=current_user");
 assert.equal(ident.rows[0].current_user,readerRole);
 assert.equal(ident.rows[0].rolsuper,false);
 let authenticatedSessionId=session;
 const write=createTransactionalOwnedNoteWriter({
  pool:writer,getVerifiedSessionId:async()=>authenticatedSessionId
 });
 assert.equal(await write({recordId:record,note:"approved note"}),true);
 assert.equal(await write({recordId:foreign,note:"cross-account"}),false);
 assert.equal(await write({recordId:"x' OR 1=1 --",note:"injection"}),false);
 const checkNote=async id=record=>(await admin.query(
  "SELECT note FROM "+q(schema)+".vault_owned_records WHERE record_id=$1",[id]
 )).rows[0].note;
 assert.equal(await checkNote(record),"approved note");
 assert.equal(await checkNote(foreign),"");
 await admin.query("UPDATE "+q(schema)+".vault_write_grants SET active=false WHERE subject_id=$1",[owner]);
 assert.equal(await write({recordId:record,note:"denied by grant"}),false);
 await admin.query("UPDATE "+q(schema)+".vault_write_grants SET active=true WHERE subject_id=$1",[owner]);
 await admin.query("UPDATE "+q(schema)+".vault_sessions SET revoked=true WHERE session_id=$1",[session]);
 assert.equal(await write({recordId:record,note:"denied by revocation"}),false);
 await admin.query("UPDATE "+q(schema)+".vault_sessions SET revoked=false,expires_at=now()-interval '1 minute' WHERE session_id=$1",[session]);
 assert.equal(await write({recordId:record,note:"denied by expiration"}),false);
 await admin.query("UPDATE "+q(schema)+".vault_sessions SET expires_at=now()+interval '1 hour' WHERE session_id=$1",[session]);
 authenticatedSessionId=otherSession;
 assert.equal(await write({recordId:record,note:"other user"}),false);
 authenticatedSessionId=session;
 // A concurrent revocation blocks on the session row locked by a transaction.
 const lock=await admin.connect();
 try{
  await lock.query("BEGIN");
  await lock.query("SELECT session_id FROM "+q(schema)+".vault_sessions WHERE session_id=$1 FOR UPDATE",[session]);
  const pending=write({recordId:record,note:"pending during revocation"});
  await new Promise(resolve=>setTimeout(resolve,80));
  await lock.query("UPDATE "+q(schema)+".vault_sessions SET revoked=true WHERE session_id=$1",[session]);
  await lock.query("COMMIT");
  assert.equal(await pending,false,"write after revocation must be denied");
 }finally{
  await lock.query("ROLLBACK").catch(()=>{});
  lock.release();
 }
 assert.equal(await checkNote(record),"approved note");
 // Restricted login cannot grant itself write permission or revoke sessions.
 await assert.rejects(writer.query("UPDATE vault_write_grants SET active=true"),e=>e.code==="42501");
 await assert.rejects(writer.query("UPDATE vault_sessions SET revoked=false"),e=>e.code==="42501");
 await assert.rejects(writer.query("UPDATE vault_owned_records SET owner_id=$1",[other]),e=>e.code==="42501");
 console.log("PASS: disposable owner-bound atomic write, grant, revocation and race isolation");
}finally{
 if(writer)await writer.end();
 if(schemaMade)await admin.query("DROP SCHEMA "+q(schema)+" CASCADE").catch(()=>{});
 if(roleMade)await admin.query("DROP ROLE "+q(readerRole)).catch(()=>{});
 await admin.end();
}
