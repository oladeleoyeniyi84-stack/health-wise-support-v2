import assert from "node:assert/strict";
import {Pool} from "pg";
import {assertDisposableDatabase} from "./support/disposable-db-guard.mjs";
import {createPostgresLockedReviewAuthorization} from "../src/integrations/stripe-v2-postgres-review-authorization.mjs";
import {revokeSandboxReviewerAccess} from "../src/integrations/stripe-v2-review-revocation.mjs";
const url=assertDisposableDatabase({url:process.env.HEALTHWISE_TEST_DATABASE_URL,ack:process.env.HEALTHWISE_ISOLATED_DB_ACK});
const admin=new Pool({connectionString:url,max:3});
const schema="hw_restricted_"+process.pid,role="hw_reader_"+process.pid;
const q=s=>'"'+s+'"';
let madeSchema=false,madeRole=false;
const sessionId="restricted_session_01",operatorId="review_staff";
try{
 await admin.query("CREATE ROLE "+q(role)+" NOLOGIN");madeRole=true;
 await admin.query("CREATE SCHEMA "+q(schema));madeSchema=true;
 await admin.query("CREATE TABLE "+q(schema)+".sandbox_review_sessions(session_id text PRIMARY KEY,operator_id text,revoked boolean,expires_at timestamptz)");
 await admin.query("CREATE TABLE "+q(schema)+".sandbox_review_grants(operator_id text,permission text,active boolean)");
 await admin.query("INSERT INTO "+q(schema)+".sandbox_review_sessions VALUES($1,$2,false,now()+interval '1 hour')",[sessionId,operatorId]);
 await admin.query("INSERT INTO "+q(schema)+".sandbox_review_grants VALUES($1,$2,true)",[operatorId,"healthwise.checkout.review_evidence"]);
 await admin.query("GRANT USAGE ON SCHEMA "+q(schema)+" TO "+q(role));
 await admin.query("GRANT SELECT ON "+q(schema)+".sandbox_review_sessions,"+q(schema)+".sandbox_review_grants TO "+q(role));
 const writer={
  connect:async()=>{
   const client=await admin.connect();
   try{await client.query("SET ROLE "+q(role));await client.query("SET search_path TO "+q(schema));}
   catch(e){client.release();throw e;}
   return {query:(...args)=>client.query(...args),release:()=>{
    // DISCARD role and search_path before returning pooled connection.
    return client.query("RESET ROLE").then(()=>client.query("RESET search_path")).finally(()=>client.release());
   }};
  }
 };
 const withAuth=createPostgresLockedReviewAuthorization({
  pool:writer,useRowLocks:false,loadVerifiedServerSession:async()=>({verifiedByServer:true,sessionId,operatorId})
 });
 const result=await withAuth(async({client,operator})=>{
  assert.equal(operator.id,operatorId);
  await assert.rejects(client.query("UPDATE sandbox_review_grants SET active=false"),e=>e.code==="42501");
  // A failed statement aborts a transaction; callback must fail closed.
  return "unreachable";
 }).then(()=>{throw Error("expected_abort");},e=>e);
 assert.ok(result instanceof Error);
 const check=await admin.query("SELECT active FROM "+q(schema)+".sandbox_review_grants");
 assert.equal(check.rows[0].active,true);
 // A clean authorized read-only transaction succeeds.
 const good=await withAuth(async({operator})=>operator.id);
 assert.equal(good,operatorId);
 // Admin revocation uses the same advisory lock and a separately scoped pool.
 const revoker={connect:async()=>{
  const client=await admin.connect();await client.query("SET search_path TO "+q(schema));
  return {query:(...args)=>client.query(...args),release:()=>{client.query("RESET search_path").finally(()=>client.release());}};
 }};
 await revokeSandboxReviewerAccess({pool:revoker,operatorId,sessionId,authorizeAdministrator:async()=>true});
 await assert.rejects(withAuth(async()=>{throw Error("unauthorized_callback");}),/review_operator_forbidden/);
 console.log("PASS: actual SELECT-only authorization adapter denies mutation and honors admin revocation");
}finally{
 if(madeSchema)await admin.query("DROP SCHEMA "+q(schema)+" CASCADE").catch(()=>{});
 if(madeRole)await admin.query("DROP ROLE "+q(role)).catch(()=>{});
 await admin.end();
}
