import test from "node:test";
import assert from "node:assert/strict";
import {makeV2CheckoutRequestSnapshot} from "../src/integrations/stripe-v2-request-snapshot.mjs";
import {makeV2FullCheckoutRequestFingerprint} from "../src/integrations/stripe-v2-full-request-fingerprint.mjs";
import {claimBlockedV2CheckoutDispatch,inspectBlockedV2Dispatch} from "../src/integrations/stripe-v2-blocked-dispatch-ledger.mjs";

const snapshot=makeV2CheckoutRequestSnapshot({
 orderId:"123e4567-e89b-42d3-a456-426614174000",
 ownerSubject:"synthetic_member",tier:"quick",
 idempotencyKey:"hwv2_dispatch_fixture_123456789"
});
const origin="https://sandbox.example.net";
const fp=makeV2FullCheckoutRequestFingerprint({snapshot,returnOrigin:origin,approvedReturnOrigin:origin});
const now=new Date("2026-11-14T20:00:00.000Z");
const args={snapshot,expectedOwnerSubject:snapshot.terms.ownerSubject,
 returnOrigin:origin,approvedReturnOrigin:origin,now};
const record={
 id:snapshot.terms.orderId,status:"pending",order_session:null,
 consultation_key:"quick",configured_price_id:snapshot.terms.stripePriceId,
 amount_minor:"4900",currency:"usd",provider_subject:snapshot.terms.ownerSubject,
 journal_state:"prepared",journal_session:null,idempotency_key:snapshot.terms.idempotencyKey,
 journal_price:snapshot.terms.stripePriceId,journal_created:new Date(now.getTime()-2000),
 base_hash:snapshot.sha256,saved_owner:snapshot.terms.ownerSubject,
 saved_price:snapshot.terms.stripePriceId,saved_amount:"4900",saved_currency:"usd",
 saved_key:snapshot.terms.idempotencyKey,full_base_hash:snapshot.sha256,
 full_hash:fp.requestSha256,success_url:fp.successUrl,cancel_url:fp.cancelUrl
};
function fixture(row=record,claimed=false){
 const calls=[];
 const client={query:async(sql)=>{
  calls.push(sql);
  if(sql.includes("FOR UPDATE OF o"))
   return {rowCount:row?1:0,rows:row?[row]:[]};
  if(sql.includes("INSERT INTO sandbox_checkout_dispatch_ledger"))
   return claimed?{rowCount:0,rows:[]}:
    {rowCount:1,rows:[{order_id:snapshot.terms.orderId}]};
  return {rowCount:0,rows:[]};
 },release:()=>calls.push("RELEASE")};
 return {pool:{connect:async()=>client},calls};
}
test("first locked claim records an uncertain outcome, NEVER send permission",async()=>{
 const f=fixture();
 const result=await claimBlockedV2CheckoutDispatch({...args,pool:f.pool});
 assert.deepEqual(result,{
  action:"outcome_uncertain_no_send",orderId:snapshot.terms.orderId,
  requestSha256:fp.requestSha256,providerWriteAuthorized:false,
  retryAllowed:false,release:"blocked"
 });
 assert.equal(f.calls[0],"BEGIN");
 assert.ok(f.calls[1].includes("FOR UPDATE OF o"));
 const insertion=f.calls.find(sql=>sql.includes("INSERT INTO sandbox_checkout_dispatch_ledger"));
 assert.match(insertion,/VALUES \(\$1,\$2,\x27outcome_uncertain\x27\)/);
 assert.deepEqual(f.calls.slice(-2),["COMMIT","RELEASE"]);
});
test("already-claimed outcome fails closed and rolls back",async()=>{
 const f=fixture(record,true);
 await assert.rejects(claimBlockedV2CheckoutDispatch({...args,pool:f.pool}),
  /dispatch_already_claimed_requires_review/);
 assert.deepEqual(f.calls.slice(-2),["ROLLBACK","RELEASE"]);
});
test("changed immutable fields or bound order must not claim dispatch",async()=>{
 for(const changed of [
  {provider_subject:"wrong"},{status:"paid"},{order_session:"cs_test_other"},
  {configured_price_id:"price_changed"},{amount_minor:"9999"},
  {journal_state:"bound"},{journal_session:"cs_test_bound"},
  {idempotency_key:"wrong"},{base_hash:"f".repeat(64)},
  {full_hash:"f".repeat(64)},{success_url:"https://attacker.example.net"}
 ]){
  const f=fixture({...record,...changed});
  await assert.rejects(claimBlockedV2CheckoutDispatch({...args,pool:f.pool}),
   /dispatch_context_mismatch/);
  assert.equal(f.calls.some(sql=>sql.includes("INSERT INTO sandbox_checkout_dispatch_ledger")),false);
 }
});
test("aged attempt blocks dispatch before insertion",async()=>{
 const f=fixture({...record,journal_created:new Date(now.getTime()-900000)});
 await assert.rejects(claimBlockedV2CheckoutDispatch({...args,pool:f.pool}),
  /checkout_attempt_requires_review/);
 assert.equal(f.calls.some(sql=>sql.includes("INSERT INTO sandbox_checkout_dispatch_ledger")),false);
});
test("tampered snapshot or untrusted origin is rejected before DB connection",async()=>{
 const f=fixture();
 await assert.rejects(claimBlockedV2CheckoutDispatch({...args,pool:f.pool,
  snapshot:{...snapshot,terms:{...snapshot.terms,quantity:2}}}),/checkout_snapshot_integrity_mismatch/);
 await assert.rejects(claimBlockedV2CheckoutDispatch({...args,pool:f.pool,
  returnOrigin:"https://attacker.example.net"}),/checkout_origin_not_approved/);
 assert.equal(f.calls.length,0);
});
test("inspection never authorizes resend, even for no dispatch row",async()=>{
 for(const state of [null,"outcome_uncertain","manual_review","bad"]){
  const pool={query:async()=>state===null?
   {rowCount:0,rows:[]}:{rowCount:1,rows:[{state}]}};
  const result=await inspectBlockedV2Dispatch({pool,orderId:snapshot.terms.orderId});
  assert.equal(result.action,"manual_review");
  assert.equal(result.retryAllowed,false);
 }
});
