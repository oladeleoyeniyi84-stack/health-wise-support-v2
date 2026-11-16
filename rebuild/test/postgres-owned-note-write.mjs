/**
 * Regression: direct row locking with SELECT-only session/grant privileges
 * must FAIL; never solve that by granting arbitrary session/grant UPDATE.
 * The positive path is tested via EXECUTE-only SECURITY DEFINER fixture in
 * postgres-restricted-owned-note-write.mjs.
 */
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
const schema="hw_direct_denied_"+suffix,role="hw_direct_reader_"+suffix;
const q=s=>'"'+s.replaceAll('"','""')+'"';
const password=randomBytes(24).toString("hex");
const sid="session_owner_"+suffix;
const admin=new Pool({connectionString:url,max:2,connectionTimeoutMillis:3000});
let schemaMade=false,roleMade=false,reader;
try{
 await admin.query("CREATE ROLE "+q(role)+" LOGIN PASSWORD '"+password+"'");roleMade=true;
 await admin.query("CREATE SCHEMA "+q(schema));schemaMade=true;
 await admin.query("CREATE TABLE "+q(schema)+".vault_sessions(session_id text PRIMARY KEY,subject_id text NOT NULL,revoked boolean NOT NULL,expires_at timestamptz NOT NULL)");
 await admin.query("CREATE TABLE "+q(schema)+".vault_owned_records(record_id text PRIMARY KEY,owner_id text NOT NULL,note text NOT NULL DEFAULT '')");
 await admin.query("CREATE TABLE "+q(schema)+".vault_write_grants(subject_id text NOT NULL,permission text NOT NULL,active boolean NOT NULL,PRIMARY KEY(subject_id,permission))");
 await admin.query("INSERT INTO "+q(schema)+".vault_sessions VALUES($1,$2,false,now()+interval '1 hour')",[sid,"member_001"]);
 await admin.query("INSERT INTO "+q(schema)+".vault_owned_records(record_id,owner_id) VALUES('record_owner','member_001')");
 await admin.query("INSERT INTO "+q(schema)+".vault_write_grants VALUES('member_001','healthwise.record.note.write',true)");
 await admin.query("GRANT USAGE ON SCHEMA "+q(schema)+" TO "+q(role));
 await admin.query("GRANT SELECT ON "+q(schema)+".vault_sessions,"+q(schema)+".vault_write_grants TO "+q(role));
 await admin.query("GRANT SELECT(record_id,owner_id),UPDATE(note) ON "+q(schema)+".vault_owned_records TO "+q(role));
 const readerUrl=new URL(url);readerUrl.username=role;readerUrl.password=password;
 reader=new Pool({connectionString:readerUrl.toString(),max:2,
  options:"-c search_path="+schema,connectionTimeoutMillis:3000});
 const writer=createTransactionalOwnedNoteWriter({
  pool:reader,getVerifiedSessionId:async()=>sid
 });
 assert.equal(await writer({recordId:"record_owner",note:"must be denied"}),false);
 const saved=await admin.query("SELECT note FROM "+q(schema)+".vault_owned_records WHERE record_id='record_owner'");
 assert.equal(saved.rows[0].note,"");
 // Even though SELECT is allowed, row-locking session/grant rows requires UPDATE.
 await assert.rejects(
  reader.query("SELECT subject_id FROM vault_sessions WHERE session_id=$1 FOR UPDATE",[sid]),
  e=>e.code==="42501"
 );
 await assert.rejects(
  reader.query("UPDATE vault_write_grants SET active=false"),
  e=>e.code==="42501"
 );
 console.log("PASS: direct restricted writer denied; use EXECUTE-only stored routine");
}finally{
 if(reader)await reader.end();
 if(schemaMade)await admin.query("DROP SCHEMA "+q(schema)+" CASCADE").catch(()=>{});
 if(roleMade)await admin.query("DROP ROLE "+q(role)).catch(()=>{});
 await admin.end();
}
