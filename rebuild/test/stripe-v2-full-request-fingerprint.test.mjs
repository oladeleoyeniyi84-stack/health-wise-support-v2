import test from "node:test";
import assert from "node:assert/strict";
import { makeV2CheckoutRequestSnapshot } from "../src/integrations/stripe-v2-request-snapshot.mjs";
import { makeV2FullCheckoutRequestFingerprint,persistV2FullCheckoutRequestFingerprint } from "../src/integrations/stripe-v2-full-request-fingerprint.mjs";
const snapshot=makeV2CheckoutRequestSnapshot({
  orderId:"123e4567-e89b-42d3-a456-426614174000",
  ownerSubject:"synthetic_owner",tier:"quick",
  idempotencyKey:"hwv2_full_request_fixture_12345"
});
const origin="https://sandbox.example.net";
const input={snapshot,returnOrigin:origin,approvedReturnOrigin:origin};
test("full request fingerprint binds exact Stripe success and cancellation URLs",()=>{
  const a=makeV2FullCheckoutRequestFingerprint(input);
  assert.match(a.requestSha256,/^[a-f0-9]{64}$/);
  assert.equal(a.snapshotSha256,snapshot.sha256);
  assert.equal(a.successUrl,origin+"/checkout/return?session_id={CHECKOUT_SESSION_ID}");
  assert.equal(a.cancelUrl,origin+"/consultations");
  assert.deepEqual(a,makeV2FullCheckoutRequestFingerprint(input));
  assert.equal(a.providerWriteAuthorized,false);
  const other=makeV2FullCheckoutRequestFingerprint({
    ...input,returnOrigin:"https://private.example.net",
    approvedReturnOrigin:"https://private.example.net"
  });
  assert.notEqual(other.requestSha256,a.requestSha256);
});
test("caller-unapproved URL and mutated financial snapshot fail before DB calls",async()=>{
 let calls=0;
 const pool={query:async()=>{calls++;throw Error("unexpected_query");}};
 await assert.rejects(persistV2FullCheckoutRequestFingerprint({
   ...input,pool,returnOrigin:"https://attacker.example.net"
 }),/checkout_origin_not_approved/);
 await assert.rejects(persistV2FullCheckoutRequestFingerprint({
   ...input,pool,snapshot:{...snapshot,terms:{...snapshot.terms,quantity:2}}
 }),/checkout_snapshot_integrity_mismatch/);
 assert.equal(calls,0);
});
test("one insert, exact idempotent replay, and mismatched row refusal",async()=>{
 const fp=makeV2FullCheckoutRequestFingerprint(input);
 const queries=[];
 const pool={query:async(sql,args)=>{
   queries.push({sql,args});
   if(queries.length===1)return {rowCount:1,rows:[{request_sha256:fp.requestSha256}]};
   if(queries.length===2)return {rowCount:0,rows:[]};
   return {rowCount:1,rows:[{
     request_sha256:fp.requestSha256,base_sha256:fp.snapshotSha256,
     success_url:fp.successUrl,cancel_url:fp.cancelUrl
   }]};
 }};
 assert.equal((await persistV2FullCheckoutRequestFingerprint({...input,pool})).action,"full_request_recorded");
 assert.equal((await persistV2FullCheckoutRequestFingerprint({...input,pool})).action,"full_request_already_recorded");
 assert.equal(queries.length,3);
 assert.ok(queries[0].sql.includes("JOIN sandbox_checkout_request_snapshots"));
 assert.equal(queries[0].args[9],fp.successUrl);
 assert.equal(queries[0].args[10],fp.cancelUrl);
});
test("existing hash mismatch or missing row fails closed",async()=>{
 for(const row of [null,{request_sha256:"f".repeat(64)}]){
   let n=0;
   const pool={query:async()=>++n===1?{rowCount:0,rows:[]}:
     {rowCount:row?1:0,rows:row?[row]:[]}};
   await assert.rejects(
     persistV2FullCheckoutRequestFingerprint({...input,pool}),
     /full_request_conflict/
   );
 }
});
