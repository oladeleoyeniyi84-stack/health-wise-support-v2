/** Disposable PostgreSQL only; no production connection or migrations. */
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {Pool} from "pg";
import {assertDisposableDatabase} from "./support/disposable-db-guard.mjs";
import {createPostgresVaultSessionStore}
 from "../src/integrations/postgres-vault-session-store.mjs";
const url=assertDisposableDatabase({
 url:process.env.HEALTHWISE_TEST_DATABASE_URL,
 ack:process.env.HEALTHWISE_ISOLATED_DB_ACK
});
const suffix=randomBytes(5).toString("hex");
const schema="hw_session_lifecycle_"+suffix,role="hw_session_writer_"+suffix;
const quote=x=>'"'+x.replaceAll('"','""')+'"';
const pass=randomBytes(24).toString("hex");
const pool=new Pool({connectionString:url,max:2,connectionTimeoutMillis:3000});
let schemaMade=false,roleMade=false,writer;
try{
 await pool.query("CREATE ROLE "+quote(role)+" LOGIN PASSWORD '"+pass+"'");roleMade=true;
 await pool.query("CREATE SCHEMA "+quote(schema));schemaMade=true;
 await pool.query("CREATE TABLE "+quote(schema)+".vault_sessions (session_id text PRIMARY KEY,subject_id text NOT NULL,revoked boolean NOT NULL,expires_at timestamptz NOT NULL)");
 await pool.query("GRANT USAGE ON SCHEMA "+quote(schema)+" TO "+quote(role));
 await pool.query("GRANT SELECT,INSERT,UPDATE ON "+quote(schema)+".vault_sessions TO "+quote(role));
 const writerUrl=new URL(url);writerUrl.username=role;writerUrl.password=pass;
 writer=new Pool({connectionString:writerUrl.toString(),max:3,
  options:"-c search_path="+schema,connectionTimeoutMillis:3000});
 const identity=await writer.query("SELECT current_user,rolsuper FROM pg_roles WHERE rolname=current_user");
 assert.equal(identity.rows[0].current_user,role);
 assert.equal(identity.rows[0].rolsuper,false);
 const store=createPostgresVaultSessionStore({pool:writer});
 const session="initial_session_"+suffix,next="rotated_session_"+suffix;
 const expiresAt=new Date(Date.now()+3600000);
 assert.equal(await store.createSession({
  sessionId:session,subjectId:"member_001",expiresAt,revoked:false
 }),true);
 assert.equal(await store.createSession({
  sessionId:session,subjectId:"member_001",expiresAt,revoked:false
 }),false,"duplicate issuance denied");
 assert.equal(await store.rotateSession({
  oldSessionId:session,newSessionId:next,subjectId:"member_001",expiresAt
 }),true);
 const previous=await pool.query("SELECT revoked FROM "+quote(schema)+".vault_sessions WHERE session_id=$1",[session]);
 assert.equal(previous.rows[0].revoked,true);
 assert.equal(await store.rotateSession({
  oldSessionId:session,newSessionId:"third_session_"+suffix,subjectId:"member_001",expiresAt
 }),false,"replayed old session denied");
 assert.equal(await store.revokeSession({sessionId:next}),true);
 assert.equal(await store.revokeSession({sessionId:next}),false);
 // Force a replacement conflict: transaction must roll back old revocation.
 const current="current_session_"+suffix,collision="occupied_session_"+suffix;
 assert.equal(await store.createSession({sessionId:current,subjectId:"member_001",expiresAt,revoked:false}),true);
 assert.equal(await store.createSession({sessionId:collision,subjectId:"member_002",expiresAt,revoked:false}),true);
 await assert.rejects(store.rotateSession({
  oldSessionId:current,newSessionId:collision,subjectId:"member_001",expiresAt
 }),/vault_rotation_replacement_failed/);
 const saved=await pool.query("SELECT revoked FROM "+quote(schema)+".vault_sessions WHERE session_id=$1",[current]);
 assert.equal(saved.rows[0].revoked,false,"old session remains valid after rollback");
 await assert.rejects(writer.query("DROP TABLE vault_sessions"),e=>e.code==="42501");
 console.log("PASS: disposable transactional session rotation, revocation and rollback");
}finally{
 if(writer)await writer.end();
 if(schemaMade)await pool.query("DROP SCHEMA "+quote(schema)+" CASCADE").catch(()=>{});
 if(roleMade)await pool.query("DROP ROLE "+quote(role)).catch(()=>{});
 await pool.end();
}
