import test from "node:test";
import assert from "node:assert/strict";
import { makeV2CheckoutRequestSnapshot } from "../src/integrations/stripe-v2-request-snapshot.mjs";
import { makeV2FullCheckoutRequestFingerprint } from "../src/integrations/stripe-v2-full-request-fingerprint.mjs";
import { auditLockedV2CheckoutRequest } from "../src/integrations/stripe-v2-locked-request-audit.mjs";

const snapshot=makeV2CheckoutRequestSnapshot({
  orderId:"123e4567-e89b-42d3-a456-426614174000",
  ownerSubject:"synthetic_owner",tier:"quick",
  idempotencyKey:"hwv2_locked_audit_fixture_12345"
});
const origin="https://sandbox.example.net";
const full=makeV2FullCheckoutRequestFingerprint({
  snapshot,returnOrigin:origin,approvedReturnOrigin:origin
});
const good={
 id:snapshot.terms.orderId,status:"pending",order_session:null,
 configured_price_id:snapshot.terms.stripePriceId,amount_minor:"4900",
 currency:"usd",consultation_key:"quick",provider_subject:snapshot.terms.ownerSubject,
 attempt_state:"prepared",attempt_session:null,idempotency_key:snapshot.terms.idempotencyKey,
 attempt_price:snapshot.terms.stripePriceId,attempt_created_at:new Date("2026-11-14T19:59:00.000Z"),
 base_sha256:snapshot.sha256,snapshot_owner:snapshot.terms.ownerSubject,
 snapshot_price:snapshot.terms.stripePriceId,snapshot_amount:"4900",
 snapshot_currency:"usd",snapshot_key:snapshot.terms.idempotencyKey,
 full_base_sha256:snapshot.sha256,full_sha256:full.requestSha256,
 success_url:full.successUrl,cancel_url:full.cancelUrl
};
const args={
 snapshot,expectedOwnerSubject:snapshot.terms.ownerSubject,
 returnOrigin:origin,approvedReturnOrigin:origin,
 now:new Date("2026-11-14T20:00:00.000Z")
};
function fixture(row=good){
 const statements=[];
 const client={
  query:async(sql)=>{
   statements.push(sql);
   if(sql.includes("FOR UPDATE OF o"))return {rowCount:row?1:0,rows:row?[row]:[]};
   return {rowCount:0,rows:[]};
  },
  release:()=>{statements.push("RELEASE");}
 };
 return {pool:{connect:async()=>client},statements};
}
test("full locked audit checks all four records and never permits Stripe writes",async()=>{
 const f=fixture();
 const result=await auditLockedV2CheckoutRequest({...args,pool:f.pool});
 assert.deepEqual(result,{
   action:"audit_verified_only",orderId:args.snapshot.terms.orderId,
   requestSha256:full.requestSha256,providerWriteAuthorized:false,release:"blocked"
 });
 assert.deepEqual(f.statements[0],"BEGIN");
 assert.ok(f.statements[1].includes("FOR UPDATE OF o"));
 assert.deepEqual(f.statements.slice(-2),["COMMIT","RELEASE"]);
});
test("altered owner, price, status, session, hashes and redirect URLs fail closed",async()=>{
 for(const changed of [
  {provider_subject:"different_owner"},{status:"paid"},
  {order_session:"cs_test_NotExpected"},{amount_minor:"9900"},
  {configured_price_id:"price_Bad"},{attempt_state:"bound"},
  {attempt_session:"cs_test_Stale"},{idempotency_key:"different_key"},
  {snapshot_owner:"different_owner"},{base_sha256:"f".repeat(64)},
  {snapshot_amount:"9900"},{full_sha256:"f".repeat(64)},
  {success_url:"https://attacker.example.net"},{cancel_url:"https://attacker.example.net"}
 ]){
  const f=fixture({...good,...changed});
  await assert.rejects(auditLockedV2CheckoutRequest({...args,pool:f.pool}),/locked_checkout_request_mismatch/);
  assert.deepEqual(f.statements.slice(-2),["ROLLBACK","RELEASE"]);
 }
});
test("stale journal blocks final audit with rollback",async()=>{
 const f=fixture({...good,attempt_created_at:new Date("2026-11-14T19:40:00.000Z")});
 await assert.rejects(auditLockedV2CheckoutRequest({...args,pool:f.pool}),/checkout_attempt_requires_review/);
 assert.deepEqual(f.statements.slice(-2),["ROLLBACK","RELEASE"]);
});
test("untrusted identity, snapshot or return origin fail before pool acquisition",async()=>{
 const f=fixture();
 for(const x of [
  {expectedOwnerSubject:"attacker"},{returnOrigin:"https://attacker.example.net"},
  {snapshot:{...snapshot,terms:{...snapshot.terms,amountCents:19900}}}
 ]){
  await assert.rejects(auditLockedV2CheckoutRequest({...args,...x,pool:f.pool}));
 }
 assert.equal(f.statements.length,0);
});
