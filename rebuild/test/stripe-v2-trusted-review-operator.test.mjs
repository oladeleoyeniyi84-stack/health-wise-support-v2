import test from "node:test";
import assert from "node:assert/strict";
import {createTrustedV2ReviewOperatorResolver} from "../src/integrations/stripe-v2-trusted-review-operator.mjs";
import {appendBlockedV2ReviewEvidence} from "../src/integrations/stripe-v2-review-evidence.mjs";

const time=new Date("2026-11-14T20:00:00.000Z");
const goodSession=()=>({
  verifiedByServer:true,revoked:false,operatorId:"staff_reviewer",
  expiresAt:new Date(time.getTime()+60000)
});
const goodGrant=id=>({operatorId:id,active:true,permission:"healthwise.checkout.review_evidence"});
function resolver({session=goodSession(),grant=goodGrant("staff_reviewer")}={}){
 let lookups=0;
 const resolveOperator=createTrustedV2ReviewOperatorResolver({
   loadVerifiedServerSession:async()=>session,
   lookupActiveReviewGrant:async()=>{lookups++;return grant;},
   now:()=>time
 });
 return {resolveOperator,lookups:()=>lookups};
}
test("verified unexpired server session and independent active grant yield exact permission",async()=>{
 const f=resolver();
 const user=await f.resolveOperator();
 assert.deepEqual(user,{
   id:"staff_reviewer",authenticated:true,
   permissions:["healthwise.checkout.review_evidence"]
 });
 assert.equal(f.lookups(),1);
 assert.ok(Object.isFrozen(user) && Object.isFrozen(user.permissions));
});
test("unauthenticated, expired, revoked or malformed session stops before grant lookup",async()=>{
 for(const session of [
   null,
   {...goodSession(),verifiedByServer:false},
   {...goodSession(),revoked:true},
   {...goodSession(),revoked:undefined},
   {...goodSession(),operatorId:"x"},
   {...goodSession(),expiresAt:time},
   {...goodSession(),expiresAt:new Date(time.getTime()-1)},
   {...goodSession(),expiresAt:"tomorrow"}
 ]){
   const f=resolver({session});
   await assert.rejects(f.resolveOperator(),/review_operator_forbidden/);
   assert.equal(f.lookups(),0);
 }
});
test("inactive, wrong-user or unrelated role grants fail closed",async()=>{
 for(const grant of [
   null,{...goodGrant("staff_reviewer"),active:false},
   goodGrant("different_member"),
   {...goodGrant("staff_reviewer"),permission:"healthwise.checkout.read_only"},
   {operatorId:"staff_reviewer",active:true,permissions:["healthwise.checkout.review_evidence"]}
 ]){
   const f=resolver({grant});
   await assert.rejects(f.resolveOperator(),/review_operator_forbidden/);
   assert.equal(f.lookups(),1);
 }
});
test("request-supplied reviewer fields cannot override authenticated operator",async()=>{
 const f=resolver();
 const values=[];
 const pool={query:async(sql,args)=>{values.push(args);return {rowCount:1,rows:[{evidence_id:"123"}]};}};
 const result=await appendBlockedV2ReviewEvidence({
   pool,orderId:"123e4567-e89b-42d3-a456-426614174000",
   requestSha256:"a".repeat(64),evidenceKind:"manual_escalation",
   evidenceSha256:"b".repeat(64),recordedBy:"attacker",
   permissions:["healthwise.checkout.review_evidence"],
   resolveOperator:f.resolveOperator
 });
 assert.equal(result.action,"evidence_recorded");
 assert.equal(values.length,1);
 assert.equal(values[0][4],"staff_reviewer");
 assert.equal(values[0].includes("attacker"),false);
 assert.equal(result.retryAllowed,false);
});
test("revoked grant results in no SQL calls",async()=>{
 let calls=0;
 const pool={query:async()=>{calls++;throw Error("unexpected_db_io");}};
 const f=resolver({grant:{...goodGrant("staff_reviewer"),active:false}});
 await assert.rejects(appendBlockedV2ReviewEvidence({
   pool,orderId:"123e4567-e89b-42d3-a456-426614174000",
   requestSha256:"a".repeat(64),evidenceKind:"manual_escalation",
   evidenceSha256:"b".repeat(64),resolveOperator:f.resolveOperator
 }),/review_operator_forbidden/);
 assert.equal(calls,0);
});

test("permission revocation is rechecked on every evidence write",async()=>{
 let active=true;
 let grantLookups=0;
 let sqlCalls=0;
 const resolveOperator=createTrustedV2ReviewOperatorResolver({
   loadVerifiedServerSession:async()=>goodSession(),
   lookupActiveReviewGrant:async id=>{
     grantLookups++;
     return {...goodGrant(id),active};
   },
   now:()=>time
 });
 const pool={query:async()=>{
   sqlCalls++;
   return {rowCount:1,rows:[{evidence_id:"synthetic-evidence"}]};
 }};
 const request={
   pool,orderId:"123e4567-e89b-42d3-a456-426614174000",
   requestSha256:"a".repeat(64),evidenceKind:"manual_escalation",
   evidenceSha256:"b".repeat(64),resolveOperator
 };
 const accepted=await appendBlockedV2ReviewEvidence(request);
 assert.equal(accepted.action,"evidence_recorded");
 assert.equal(sqlCalls,1);
 active=false;
 await assert.rejects(appendBlockedV2ReviewEvidence(request),/review_operator_forbidden/);
 assert.equal(grantLookups,2,"must not reuse a cached permission grant");
 assert.equal(sqlCalls,1,"revoked reviewer must not reach the database");
});
test("reviewer grant lookup failure cannot write evidence",async()=>{
 let sqlCalls=0;
 const resolveOperator=createTrustedV2ReviewOperatorResolver({
   loadVerifiedServerSession:async()=>goodSession(),
   lookupActiveReviewGrant:async()=>{throw new Error("grant_store_unavailable");},
   now:()=>time
 });
 const pool={query:async()=>{sqlCalls++;throw Error("unexpected_db_io");}};
 await assert.rejects(appendBlockedV2ReviewEvidence({
   pool,orderId:"123e4567-e89b-42d3-a456-426614174000",
   requestSha256:"a".repeat(64),evidenceKind:"manual_escalation",
   evidenceSha256:"b".repeat(64),resolveOperator
 }),/grant_store_unavailable/);
 assert.equal(sqlCalls,0);
});

test("session expiry between sequential evidence writes fails closed before grant or SQL",async()=>{
 let clock=new Date(time);
 let grantCalls=0;
 let sqlCalls=0;
 const resolveOperator=createTrustedV2ReviewOperatorResolver({
   loadVerifiedServerSession:async()=>goodSession(),
   lookupActiveReviewGrant:async id=>{grantCalls++;return goodGrant(id);},
   now:()=>clock
 });
 const pool={query:async()=>{sqlCalls++;return {rowCount:1,rows:[{evidence_id:"synthetic-evidence"}]};}};
 const request={
   pool,orderId:"123e4567-e89b-42d3-a456-426614174000",
   requestSha256:"a".repeat(64),evidenceKind:"manual_escalation",
   evidenceSha256:"b".repeat(64),resolveOperator
 };
 assert.equal((await appendBlockedV2ReviewEvidence(request)).action,"evidence_recorded");
 clock=new Date(time.getTime()+60000);
 await assert.rejects(appendBlockedV2ReviewEvidence(request),/review_operator_forbidden/);
 assert.equal(grantCalls,1,"expired session must not reach grant lookup");
 assert.equal(sqlCalls,1,"expired session must not reach SQL");
});
test("server-session lookup failure fails closed before grant or SQL",async()=>{
 let grantCalls=0;
 let sqlCalls=0;
 const resolveOperator=createTrustedV2ReviewOperatorResolver({
   loadVerifiedServerSession:async()=>{throw new Error("session_store_unavailable");},
   lookupActiveReviewGrant:async()=>{grantCalls++;return goodGrant("staff_reviewer");},
   now:()=>time
 });
 const pool={query:async()=>{sqlCalls++;throw Error("unexpected_db_io");}};
 await assert.rejects(appendBlockedV2ReviewEvidence({
   pool,orderId:"123e4567-e89b-42d3-a456-426614174000",
   requestSha256:"a".repeat(64),evidenceKind:"manual_escalation",
   evidenceSha256:"b".repeat(64),resolveOperator
 }),/session_store_unavailable/);
 assert.equal(grantCalls,0);
 assert.equal(sqlCalls,0);
});
