/** Disposable PostgreSQL security-definer privileges and revocation race. */
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {Pool} from "pg";
import {assertDisposableDatabase} from "./support/disposable-db-guard.mjs";
import {disposableOwnedNoteRoutineSql} from "./support/disposable-owned-note-function.mjs";
import {createRestrictedNoteWriteExecutor}
 from "../src/integrations/postgres-restricted-note-write.mjs";

const url=assertDisposableDatabase({
 url:process.env.HEALTHWISE_TEST_DATABASE_URL,
 ack:process.env.HEALTHWISE_ISOLATED_DB_ACK
});
const suffix=randomBytes(5).toString("hex");
const schema="hw_secure_write_"+suffix,role="hw_exec_"+suffix;
const q=s=>'"'+s.replaceAll('"','""')+'"';
const password=randomBytes(24).toString("hex");
const owner="member_001",other="member_002",sid="session_owner_"+suffix;
const record="record_owner",foreign="record_other";
const admin=new Pool({connectionString:url,max:3,connectionTimeoutMillis:3000});
let roleMade=false,schemaMade=false,restricted;
try{
 await admin.query("CREATE ROLE "+q(role)+" LOGIN PASSWORD '"+password+"'");roleMade=true;
 await admin.query("CREATE SCHEMA "+q(schema));schemaMade=true;
 await admin.query("REVOKE ALL ON SCHEMA "+q(schema)+" FROM PUBLIC");
 await admin.query("CREATE TABLE "+q(schema)+".vault_sessions(session_id text PRIMARY KEY,subject_id text NOT NULL,revoked boolean NOT NULL,expires_at timestamptz NOT NULL)");
 await admin.query("CREATE TABLE "+q(schema)+".vault_owned_records(record_id text PRIMARY KEY,owner_id text NOT NULL,note text NOT NULL DEFAULT '')");
 await admin.query("CREATE TABLE "+q(schema)+".vault_write_grants(subject_id text NOT NULL,permission text NOT NULL,active boolean NOT NULL,PRIMARY KEY(subject_id,permission))");
 await admin.query("INSERT INTO "+q(schema)+".vault_sessions VALUES($1,$2,false,now()+interval '1 hour')",[sid,owner]);
 await admin.query("INSERT INTO "+q(schema)+".vault_owned_records(record_id,owner_id) VALUES ($1,$2),($3,$4)",[record,owner,foreign,other]);
 await admin.query("INSERT INTO "+q(schema)+".vault_write_grants VALUES($1,$2,true)",[owner,"healthwise.record.note.write"]);
 await admin.query(disposableOwnedNoteRoutineSql(schema));
 // Harden default function EXECUTE from PUBLIC before granting one exact role.
 await admin.query("REVOKE ALL ON FUNCTION "+q(schema)+".vault_write_owned_note(text,text,text) FROM PUBLIC");
 await admin.query("GRANT USAGE ON SCHEMA "+q(schema)+" TO "+q(role));
 await admin.query("GRANT EXECUTE ON FUNCTION "+q(schema)+".vault_write_owned_note(text,text,text) TO "+q(role));
 const restrictedUrl=new URL(url);
 restrictedUrl.username=role;restrictedUrl.password=password;
 restricted=new Pool({connectionString:restrictedUrl.toString(),max:3,
  options:"-c search_path="+schema,connectionTimeoutMillis:3000});
 const identity=await restricted.query("SELECT current_user,rolsuper FROM pg_roles WHERE rolname=current_user");
 assert.equal(identity.rows[0].current_user,role);
 assert.equal(identity.rows[0].rolsuper,false);
 let trustedSession=sid;
 const write=createRestrictedNoteWriteExecutor({
  pool:restricted,getVerifiedSessionId:async()=>trustedSession
 });
 const note=async id=record=>(await admin.query("SELECT note FROM "+q(schema)+".vault_owned_records WHERE record_id=$1",[id])).rows[0].note;
 assert.equal(await write({recordId:record,note:"verified"}),true);
 assert.equal(await write({recordId:foreign,note:"other user"}),false);
 assert.equal(await note(record),"verified");
 assert.equal(await note(foreign),"");
 // EXECUTE-only role can neither forge sessions nor mint grants.
 for(const query of [
  "SELECT session_id FROM vault_sessions",
  "UPDATE vault_sessions SET revoked=false",
  "UPDATE vault_write_grants SET active=true",
  "UPDATE vault_owned_records SET owner_id='member_002'"
 ])await assert.rejects(restricted.query(query),e=>e.code==="42501");
 await admin.query("UPDATE "+q(schema)+".vault_write_grants SET active=false WHERE subject_id=$1",[owner]);
 assert.equal(await write({recordId:record,note:"denied grant"}),false);
 await admin.query("UPDATE "+q(schema)+".vault_write_grants SET active=true WHERE subject_id=$1",[owner]);
 await admin.query("UPDATE "+q(schema)+".vault_sessions SET revoked=true WHERE session_id=$1",[sid]);
 assert.equal(await write({recordId:record,note:"denied revoked"}),false);
 await admin.query("UPDATE "+q(schema)+".vault_sessions SET revoked=false,expires_at=now()-interval '1 minute' WHERE session_id=$1",[sid]);
 assert.equal(await write({recordId:record,note:"denied expired"}),false);
 await admin.query("UPDATE "+q(schema)+".vault_sessions SET expires_at=now()+interval '1 hour' WHERE session_id=$1",[sid]);
 // Revocation takes the session-row lock first, so a pending write must
 // re-evaluate the revoked predicate after that transaction commits.
 const lock=await admin.connect();
 try{
  await lock.query("BEGIN");
  await lock.query("SELECT session_id FROM "+q(schema)+".vault_sessions WHERE session_id=$1 FOR UPDATE",[sid]);
  const pending=write({recordId:record,note:"race denied"});
  await new Promise(resolve=>setTimeout(resolve,60));
  await lock.query("UPDATE "+q(schema)+".vault_sessions SET revoked=true WHERE session_id=$1",[sid]);
  await lock.query("COMMIT");
  assert.equal(await pending,false);
 }finally{
  await lock.query("ROLLBACK").catch(()=>{});
  lock.release();
 }
 assert.equal(await note(record),"verified");
 trustedSession="not_registered_"+suffix;
 assert.equal(await write({recordId:record,note:"invalid session"}),false);
 console.log("PASS: isolated EXECUTE-only writer enforces locks, grant/owner policy, and revocation race");
}finally{
 if(restricted)await restricted.end();
 if(schemaMade)await admin.query("DROP SCHEMA "+q(schema)+" CASCADE").catch(()=>{});
 if(roleMade)await admin.query("DROP ROLE "+q(role)).catch(()=>{});
 await admin.end();
}
