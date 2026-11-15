import test from "node:test";
import assert from "node:assert/strict";
import {appendBlockedV2ReviewEvidenceAtomically as append} from "../src/integrations/stripe-v2-atomic-review-evidence.mjs";

const input={orderId:"123e4567-e89b-42d3-a456-426614174000",
 requestSha256:"a".repeat(64),evidenceKind:"manual_escalation",
 evidenceSha256:"b".repeat(64)};
const operator={authenticated:true,id:"review_staff",permissions:["healthwise.checkout.review_evidence"]};

test("atomic boundary refuses missing lock-capable authorization adapter",async()=>{
 await assert.rejects(append(input),/locked_review_authorization_required/);
});
test("rejects invalid evidence before invoking authorization adapter",async()=>{
 let calls=0;
 await assert.rejects(append({...input,orderId:"bad",
  withLockedReviewAuthorization:async()=>{calls++;}}),/invalid_review_evidence/);
 assert.equal(calls,0);
});
test("locked callback writes only reviewer identity supplied by trusted adapter",async()=>{
 let sqlCalls=0;
 const result=await append({...input,
  withLockedReviewAuthorization:async fn=>fn({
   operator,client:{query:async(sql,values)=>{
    sqlCalls++;
    assert.equal(values[4],"review_staff");
    assert.match(sql,/ON CONFLICT/);
    return {rowCount:1,rows:[{evidence_id:"1"}]};
   }}
  })
 });
 assert.equal(result.action,"evidence_recorded");
 assert.equal(result.retryAllowed,false);
 assert.equal(sqlCalls,1);
});
test("revoked grant at locked authorization boundary prevents any evidence write",async()=>{
 let writes=0;
 const withLockedReviewAuthorization=async fn=>{
  // A host adapter must lock and verify session/grant before invoking fn.
  const grantActive=false;
  if(!grantActive)throw new Error("review_operator_forbidden");
  return fn({operator,client:{query:async()=>{writes++;}}});
 };
 await assert.rejects(append({...input,withLockedReviewAuthorization}),/review_operator_forbidden/);
 assert.equal(writes,0);
});
test("invalid locked identity fails before SQL",async()=>{
 let writes=0;
 await assert.rejects(append({...input,withLockedReviewAuthorization:async fn=>fn({
  operator:{...operator,permissions:[]},
  client:{query:async()=>{writes++;}}
 })}),/review_operator_forbidden/);
 assert.equal(writes,0);
});
test("authorization adapter errors propagate without fallback writes",async()=>{
 await assert.rejects(append({...input,
  withLockedReviewAuthorization:async()=>{throw new Error("grant_store_unavailable");}
 }),/grant_store_unavailable/);
});
test("duplicate evidence remains idempotent only for same reviewer",async()=>{
 const withLockedReviewAuthorization=async fn=>fn({operator,client:{query:async sql=>
  sql.startsWith("INSERT")?{rowCount:0,rows:[]}:
   {rowCount:1,rows:[{evidence_id:"1",recorded_by:"review_staff"}]}
 }});
 const result=await append({...input,withLockedReviewAuthorization});
 assert.equal(result.action,"evidence_already_recorded");
 assert.equal(result.release,"blocked");
});
