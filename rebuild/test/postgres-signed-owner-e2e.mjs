/**
 * Disposable-only signed session -> PostgreSQL session -> owner proof.
 * The fixture signs a synthetic credential; it does NOT create live sessions.
 */
import assert from "node:assert/strict";
import {createHmac,randomBytes} from "node:crypto";
import {Pool} from "pg";
import {assertDisposableDatabase} from "./support/disposable-db-guard.mjs";
import {createSignedSessionVerifier} from "../src/integrations/signed-session-verifier.mjs";
import {createPostgresSessionRecordReader} from "../src/integrations/postgres-session-reader.mjs";
import {createPostgresOwnerReadProof} from "../src/integrations/postgres-owner-read-proof.mjs";

const url=assertDisposableDatabase({
 url:process.env.HEALTHWISE_TEST_DATABASE_URL,
 ack:process.env.HEALTHWISE_ISOLATED_DB_ACK
});
const suffix=randomBytes(5).toString("hex"),key=randomBytes(32);
const schema="hw_signed_owner_"+suffix,role="hw_signed_reader_"+suffix;
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const password=randomBytes(24).toString("hex");
const sid="signed_session_"+suffix,owner="member_001",other="member_002",rid="record_001";
const sign=(id,secret=key)=>"v1."+id+"."+createHmac("sha256",secret)
 .update("healthwise.session.v1:"+id).digest("base64url");
const admin=new Pool({connectionString:url,max:2,connectionTimeoutMillis:3000});
let createdRole=false,createdSchema=false,reader;
try{
 await admin.query("CREATE ROLE "+quote(role)+" LOGIN PASSWORD '"+password+"'");createdRole=true;
 await admin.query("CREATE SCHEMA "+quote(schema));createdSchema=true;
 await admin.query("CREATE TABLE "+quote(schema)+".vault_sessions(session_id text PRIMARY KEY,subject_id text NOT NULL,revoked boolean NOT NULL,expires_at timestamptz NOT NULL)");
 await admin.query("CREATE TABLE "+quote(schema)+".vault_owned_records(record_id text PRIMARY KEY,owner_id text NOT NULL)");
 await admin.query("INSERT INTO "+quote(schema)+".vault_sessions VALUES($1,$2,false,now()+interval '1 hour')",[sid,owner]);
 await admin.query("INSERT INTO "+quote(schema)+".vault_owned_records VALUES($1,$2)",[rid,owner]);
 await admin.query("GRANT USAGE ON SCHEMA "+quote(schema)+" TO "+quote(role));
 await admin.query("GRANT SELECT ON "+quote(schema)+".vault_sessions,"+quote(schema)+".vault_owned_records TO "+quote(role));
 const restrictedUrl=new URL(url);restrictedUrl.username=role;restrictedUrl.password=password;
 reader=new Pool({connectionString:restrictedUrl.toString(),max:2,
  options:"-c search_path="+schema,connectionTimeoutMillis:3000});
 const identity=await reader.query("SELECT current_user,rolsuper FROM pg_roles WHERE rolname=current_user");
 assert.equal(identity.rows[0].current_user,role);
 assert.equal(identity.rows[0].rolsuper,false);
 const verify=createSignedSessionVerifier({
  signingKey:key,loadSessionRecord:createPostgresSessionRecordReader({pool:reader})
 });
 const canRead=async(token,recordId)=>{
  const verified=await verify(token);
  if(!verified)return false;
  return createPostgresOwnerReadProof({
   pool:reader,getAuthenticatedSessionId:async()=>verified.sessionId
  })({recordId});
 };
 assert.equal(await canRead(sign(sid),rid),true,"valid signed owner");
 assert.equal(await canRead(sign(sid,randomBytes(32)),rid),false,"forged signature");
 assert.equal(await canRead(sign(sid),other),false,"record mismatch");
 await admin.query("UPDATE "+quote(schema)+".vault_sessions SET subject_id=$1 WHERE session_id=$2",[other,sid]);
 assert.equal(await canRead(sign(sid),rid),false,"cross-account denied");
 await admin.query("UPDATE "+quote(schema)+".vault_sessions SET subject_id=$1,revoked=true WHERE session_id=$2",[owner,sid]);
 assert.equal(await canRead(sign(sid),rid),false,"revoked denied");
 await admin.query("UPDATE "+quote(schema)+".vault_sessions SET revoked=false,expires_at=now()-interval '1 minute' WHERE session_id=$1",[sid]);
 assert.equal(await canRead(sign(sid),rid),false,"expired denied");
 await assert.rejects(reader.query("UPDATE vault_sessions SET revoked=false"),
  error=>error.code==="42501");
 await assert.rejects(reader.query("UPDATE vault_owned_records SET owner_id=$1",[other]),
  error=>error.code==="42501");
 console.log("PASS: disposable signed-session-to-owner read with restricted PostgreSQL role");
}finally{
 if(reader)await reader.end();
 if(createdSchema)await admin.query("DROP SCHEMA "+quote(schema)+" CASCADE").catch(()=>{});
 if(createdRole)await admin.query("DROP ROLE "+quote(role)).catch(()=>{});
 await admin.end();
}
