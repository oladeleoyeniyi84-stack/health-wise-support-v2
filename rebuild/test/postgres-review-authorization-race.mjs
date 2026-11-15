import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {Pool} from "pg";
import {assertDisposableDatabase} from "./support/disposable-db-guard.mjs";
import {createPostgresLockedReviewAuthorization} from "../src/integrations/stripe-v2-postgres-review-authorization.mjs";
const url=assertDisposableDatabase({url:process.env.HEALTHWISE_TEST_DATABASE_URL,ack:process.env.HEALTHWISE_ISOLATED_DB_ACK});
const schema="hw_review_race_"+process.pid;
const admin=new Pool({connectionString:url,max:2,connectionTimeoutMillis:3000});
const pool=new Pool({connectionString:url,max:4,connectionTimeoutMillis:3000,options:"-c search_path="+schema});
const sessionId="trusted_session_0001",operatorId="review_staff";
const permission="healthwise.checkout.review_evidence";
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
let created=false;
try{
 const setup=await admin.connect();
 try{
  await setup.query('CREATE SCHEMA "'+schema+'"');created=true;
  await setup.query('SET search_path TO "'+schema+'",public');
  const ddl=await readFile(new URL("../db/008_review_authorization_serialization.sql",import.meta.url),"utf8");
  await setup.query(ddl.replace(/^BEGIN;\s*/m,"").replace(/\s*COMMIT;\s*$/m,""));
  await setup.query("INSERT INTO sandbox_review_sessions(session_id,operator_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[sessionId,operatorId]);
  await setup.query("INSERT INTO sandbox_review_grants(operator_id,permission,active) VALUES($1,$2,true)",[operatorId,permission]);
 }finally{setup.release();}
 const withLockedReviewAuthorization=createPostgresLockedReviewAuthorization({
  pool,loadVerifiedServerSession:async()=>({verifiedByServer:true,sessionId,operatorId})
 });
 // Write-first ordering: revocation must wait for the authorized transaction.
 const entered=deferred(),release=deferred();
 const write=withLockedReviewAuthorization(async({client})=>{
  entered.resolve();await release.promise;
  await client.query("CREATE TABLE IF NOT EXISTS review_test_writes(id int)");
  await client.query("INSERT INTO review_test_writes(id) VALUES(1)");
 });
 await entered.promise;
 let revokeDone=false;
 const revoke=pool.query("UPDATE sandbox_review_grants SET active=false WHERE operator_id=$1",[operatorId]).then(()=>{revokeDone=true;});
 // A second connection cannot complete UPDATE while the grant row is locked.
 const probe=await pool.query("SELECT active FROM sandbox_review_grants WHERE operator_id=$1",[operatorId]);
 assert.equal(probe.rows[0].active,true);
 assert.equal(revokeDone,false);
 release.resolve();await write;await revoke;
 assert.equal(revokeDone,true);
 await assert.rejects(withLockedReviewAuthorization(async()=>{throw Error("unexpected_write");}),/review_operator_forbidden/);
 const count=await pool.query("SELECT count(*)::int AS n FROM review_test_writes");
 assert.equal(count.rows[0].n,1);
 // Revoke-first ordering: the later writer is denied.
 await pool.query("UPDATE sandbox_review_grants SET active=true WHERE operator_id=$1",[operatorId]);
 const blocker=await pool.connect();
 try{
  await blocker.query("BEGIN");
  await blocker.query("UPDATE sandbox_review_grants SET active=false WHERE operator_id=$1",[operatorId]);
  const pending=withLockedReviewAuthorization(async()=>{throw Error("unauthorized_write");});
  await blocker.query("COMMIT");
  await assert.rejects(pending,/review_operator_forbidden/);
 }finally{await blocker.query("ROLLBACK").catch(()=>{});blocker.release();}
 // Session revocation must serialize with an in-flight evidence transaction too.
 await pool.query("UPDATE sandbox_review_grants SET active=true WHERE operator_id=$1",[operatorId]);
 const sessionEntered=deferred(),sessionRelease=deferred();
 const sessionWrite=withLockedReviewAuthorization(async()=>{
  sessionEntered.resolve();
  await sessionRelease.promise;
 });
 await sessionEntered.promise;
 let sessionRevocationDone=false;
 const sessionRevocation=pool.query(
  "UPDATE sandbox_review_sessions SET revoked=true WHERE session_id=$1",[sessionId]
 ).then(()=>{sessionRevocationDone=true;});
 const sessionProbe=await pool.query(
  "SELECT revoked FROM sandbox_review_sessions WHERE session_id=$1",[sessionId]);
 assert.equal(sessionProbe.rows[0].revoked,false);
 assert.equal(sessionRevocationDone,false);
 sessionRelease.resolve();
 await sessionWrite;
 await sessionRevocation;
 assert.equal(sessionRevocationDone,true);
 await assert.rejects(withLockedReviewAuthorization(async()=>{
  throw Error("revoked_session_write");
 }),/review_operator_forbidden/);
 // Rollback path: failed evidence callback must not persist any partial write.
 await pool.query("UPDATE sandbox_review_sessions SET revoked=false WHERE session_id=$1",[sessionId]);
 await assert.rejects(withLockedReviewAuthorization(async({client})=>{
  await client.query("INSERT INTO review_test_writes(id) VALUES(99)");
  throw new Error("synthetic_evidence_failure");
 }),/synthetic_evidence_failure/);
 const rolledBack=await pool.query("SELECT count(*)::int AS n FROM review_test_writes WHERE id=99");
 assert.equal(rolledBack.rows[0].n,0);
 console.log("PASS: disposable PostgreSQL serializes reviewer evidence and grant revocation in both orderings");
}finally{
 await pool.end();
 if(created){const cleanup=await admin.connect();try{await cleanup.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');}finally{cleanup.release();}}
 await admin.end();
}
