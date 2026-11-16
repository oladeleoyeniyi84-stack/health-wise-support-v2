import test from "node:test";
import assert from "node:assert/strict";
import {createTrustedPostgresAdminSessionDependencies as create} from "../src/integrations/stripe-v2-postgres-admin-session-dependencies.mjs";
import {createTrustedReviewRevocationAuthorizer} from "../src/integrations/stripe-v2-trusted-review-admin.mjs";
const now=()=>new Date("2026-11-15T00:00:00Z");
const id="trusted_session_0001";
const operatorId="admin_staff";
const permission="healthwise.checkout.review_access.revoke";
const session={operator_id:operatorId,revoked:false,expires_at:new Date("2027-01-01T00:00:00Z")};
const grant={operator_id:operatorId,permission,active:true};
function setup({sessionRow=session,grantRow=grant,sessionId=id}={}){
 const calls=[];
 const pool={query:async(sql,args)=>{
  calls.push({sql,args});
  return sql.includes("sandbox_review_admin_grants")
   ?{rowCount:grantRow?1:0,rows:grantRow?[grantRow]:[]}
   :{rowCount:sessionRow?1:0,rows:sessionRow?[sessionRow]:[]};
 }};
 const dependencies=create({pool,getAuthenticatedSessionId:async()=>sessionId,now});
 return {calls,dependencies};
}
test("valid server-owned session and independent admin grant authorize",async()=>{
 const {calls,dependencies}=setup();
 assert.equal(await createTrustedReviewRevocationAuthorizer({...dependencies,now})(),true);
 assert.equal(calls.length,2);
 assert.match(calls[0].sql,/WHERE session_id=\$1/);
 assert.deepEqual(calls[0].args,[id]);
 assert.deepEqual(calls[1].args,[operatorId,permission]);
});
test("missing or malformed server session ID never queries database",async()=>{
 for(const sessionId of [null,"","unknown","invalid' OR 1=1"]){
  const {calls,dependencies}=setup({sessionId});
  await assert.rejects(dependencies.loadVerifiedServerSession(),/review_admin_forbidden/);
  assert.equal(calls.length,0);
 }
});
test("revoked, expired, missing or malformed server-owned session fails closed",async()=>{
 for(const sessionRow of [{...session,revoked:true},
  {...session,expires_at:new Date("2020-01-01")},null,
  {...session,operator_id:"bad value"}]){
  const {calls,dependencies}=setup({sessionRow});
  await assert.rejects(
   createTrustedReviewRevocationAuthorizer({...dependencies,now})(),
   /review_admin_forbidden/
  );
  assert.equal(calls.length,1,"grant lookup must not run for invalid sessions");
 }
});
test("missing, inactive, mismatched and unrelated grants fail closed",async()=>{
 for(const grantRow of [null,{...grant,active:false},
  {...grant,operator_id:"different_admin"},
  {...grant,permission:"healthwise.checkout.review_evidence"}]){
  const {dependencies}=setup({grantRow});
  await assert.rejects(
   createTrustedReviewRevocationAuthorizer({...dependencies,now})(),
   /review_admin_forbidden/
  );
 }
});
test("database outage denies access, never fabricates a session",async()=>{
 const dependencies=create({
  pool:{query:async()=>{throw Error("database_unavailable");}},
  getAuthenticatedSessionId:async()=>id,now
 });
 await assert.rejects(
  createTrustedReviewRevocationAuthorizer({...dependencies,now})(),
  /database_unavailable/
 );
});
