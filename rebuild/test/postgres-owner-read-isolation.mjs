/**
 * Disposable PostgreSQL integration only. Uses the existing CI disposable
 * database guard; NEVER target Render, production, or a shared database.
 */
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {Pool} from "pg";
import {assertDisposableDatabase} from "./support/disposable-db-guard.mjs";
import {createPostgresOwnerReadProof} from "../src/integrations/postgres-owner-read-proof.mjs";

const url=assertDisposableDatabase({
 url:process.env.HEALTHWISE_TEST_DATABASE_URL,
 ack:process.env.HEALTHWISE_ISOLATED_DB_ACK
});
const suffix=randomBytes(5).toString("hex");
const schema="hw_owner_"+suffix,role="hw_owner_reader_"+suffix;
const q=s=>'"'+s.replaceAll('"','""')+'"';
const password=randomBytes(20).toString("hex");
const owner="member_001",other="member_002",record="record_001";
const sid="server_session_"+suffix;
const admin=new Pool({connectionString:url,max:2,connectionTimeoutMillis:3000});
let roleMade=false,schemaMade=false,reader;
try{
 await admin.query("CREATE ROLE "+q(role)+" LOGIN PASSWORD '"+password+"'");roleMade=true;
 await admin.query("CREATE SCHEMA "+q(schema));schemaMade=true;
 await admin.query("CREATE TABLE "+q(schema)+".vault_sessions (session_id text PRIMARY KEY,subject_id text NOT NULL,revoked boolean NOT NULL,expires_at timestamptz NOT NULL)");
 await admin.query("CREATE TABLE "+q(schema)+".vault_owned_records (record_id text PRIMARY KEY,owner_id text NOT NULL)");
 await admin.query("INSERT INTO "+q(schema)+".vault_sessions VALUES($1,$2,false,now()+interval '1 hour')",[sid,owner]);
 await admin.query("INSERT INTO "+q(schema)+".vault_owned_records VALUES($1,$2)",[record,owner]);
 await admin.query("GRANT USAGE ON SCHEMA "+q(schema)+" TO "+q(role));
 await admin.query("GRANT SELECT ON "+q(schema)+".vault_sessions,"+q(schema)+".vault_owned_records TO "+q(role));
 const readerUrl=new URL(url);readerUrl.username=role;readerUrl.password=password;
 reader=new Pool({connectionString:readerUrl.toString(),max:2,
  options:"-c search_path="+schema,connectionTimeoutMillis:3000});
 const ident=await reader.query("SELECT current_user,rolsuper FROM pg_roles WHERE rolname=current_user");
 assert.equal(ident.rows[0].current_user,role);
 assert.equal(ident.rows[0].rolsuper,false);
 let trustedSessionId=sid;
 const mayRead=createPostgresOwnerReadProof({
  pool:reader,getAuthenticatedSessionId:async()=>trustedSessionId
 });
 assert.equal(await mayRead({recordId:record}),true,"matching owner allowed");
 await admin.query("UPDATE "+q(schema)+".vault_sessions SET subject_id=$1 WHERE session_id=$2",[other,sid]);
 assert.equal(await mayRead({recordId:record}),false,"cross-account denied");
 await admin.query("UPDATE "+q(schema)+".vault_sessions SET subject_id=$1,revoked=true WHERE session_id=$2",[owner,sid]);
 assert.equal(await mayRead({recordId:record}),false,"revoked session denied");
 await admin.query("UPDATE "+q(schema)+".vault_sessions SET revoked=false,expires_at=now()-interval '1 minute' WHERE session_id=$1",[sid]);
 assert.equal(await mayRead({recordId:record}),false,"expired session denied");
 await admin.query("UPDATE "+q(schema)+".vault_sessions SET expires_at=now()+interval '1 hour' WHERE session_id=$1",[sid]);
 trustedSessionId="unknown_session_"+suffix;
 assert.equal(await mayRead({recordId:record}),false,"missing session denied");
 trustedSessionId=sid;
 assert.equal(await mayRead({recordId:"not_there"}),false,"unknown record denied");
 await assert.rejects(
  reader.query("UPDATE vault_owned_records SET owner_id=$1 WHERE record_id=$2",[other,record]),
  error=>error.code==="42501"
 );
 await assert.rejects(
  reader.query("UPDATE vault_sessions SET revoked=false"),
  error=>error.code==="42501"
 );
 const saved=await admin.query("SELECT owner_id FROM "+q(schema)+".vault_owned_records WHERE record_id=$1",[record]);
 assert.equal(saved.rows[0].owner_id,owner);
 console.log("PASS: disposable PostgreSQL owner read isolation, revocation and restricted DB role");
}finally{
 if(reader)await reader.end();
 if(schemaMade)await admin.query("DROP SCHEMA "+q(schema)+" CASCADE").catch(()=>{});
 if(roleMade)await admin.query("DROP ROLE "+q(role)).catch(()=>{});
 await admin.end();
}
