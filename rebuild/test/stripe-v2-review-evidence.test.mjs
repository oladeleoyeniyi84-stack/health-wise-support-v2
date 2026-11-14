import test from "node:test";
import assert from "node:assert/strict";
import {appendBlockedV2ReviewEvidence} from "../src/integrations/stripe-v2-review-evidence.mjs";

const reviewer=(id="synthetic_reviewer",permissions=["healthwise.checkout.review_evidence"])=>async()=>({authenticated:true,id,permissions});
const baseline={
  orderId:"123e4567-e89b-42d3-a456-426614174000",
  requestSha256:"a".repeat(64),evidenceKind:"provider_lookup_incomplete",
  evidenceSha256:"b".repeat(64),resolveOperator:reviewer()
};
test("records only bounded, no-retry review metadata",async()=>{
 const queries=[];
 const pool={query:async(sql,values)=>{
   queries.push({sql,values});
   return {rowCount:1,rows:[{evidence_id:"1"}]};
 }};
 const result=await appendBlockedV2ReviewEvidence({pool,...baseline});
 assert.deepEqual(result,{action:"evidence_recorded",orderId:baseline.orderId,retryAllowed:false,release:"blocked"});
 assert.ok(queries[0].sql.includes("JOIN")===false);
 assert.ok(queries[0].sql.includes("sandbox_checkout_dispatch_ledger"));
 assert.ok(queries[0].sql.includes("ON CONFLICT"));
 assert.equal(queries[0].values.length,5);
});
test("exact duplicate is idempotent, different reviewer cannot claim old record",async()=>{
 const pool={query:async(sql)=>sql.startsWith("INSERT")
  ?{rowCount:0,rows:[]}
  :{rowCount:1,rows:[{evidence_id:"1",recorded_by:"synthetic_reviewer"}]}};
 const r=await appendBlockedV2ReviewEvidence({pool,...baseline});
 assert.equal(r.action,"evidence_already_recorded");
 assert.equal(r.retryAllowed,false);
 await assert.rejects(appendBlockedV2ReviewEvidence({
  pool,...baseline,resolveOperator:reviewer("other_reviewer")
 }),/review_evidence_conflict/);
});
test("no dispatch record or changed digest fails closed",async()=>{
 const pool={query:async()=>({rowCount:0,rows:[]})};
 await assert.rejects(appendBlockedV2ReviewEvidence({pool,...baseline}),/review_evidence_conflict/);
});
test("rejects raw evidence, invalid reviewer, unsupported labels before database I/O",async()=>{
 let calls=0;
 const pool={query:async()=>{calls++;throw Error("unexpected");}};
 for(const patch of [
  {orderId:"untrusted"},{requestSha256:"x"},
  {evidenceKind:"provider_absent_verified"},{evidenceSha256:"raw-stripe-data"}
 ]){
  await assert.rejects(appendBlockedV2ReviewEvidence({pool,...baseline,...patch}),/invalid_review_evidence/);
 }
 assert.equal(calls,0);
});

test("unauthenticated, unauthorized and untrusted reviewers never write evidence",async()=>{
 let calls=0;
 const pool={query:async()=>{calls++;throw Error("unexpected_write");}};
 for(const resolveOperator of [
  async()=>null,
  async()=>({authenticated:false,id:"synthetic_reviewer",permissions:["healthwise.checkout.review_evidence"]}),
  reviewer("synthetic_reviewer",[]),reviewer("a"),reviewer("a@company.com")
 ])await assert.rejects(appendBlockedV2ReviewEvidence({pool,...baseline,resolveOperator}),/review_operator_forbidden/);
 await assert.rejects(appendBlockedV2ReviewEvidence({pool,...baseline,resolveOperator:undefined}),/trusted_operator_required/);
 assert.equal(calls,0);
});
