import test from "node:test";
import assert from "node:assert/strict";
import { makeV2CheckoutRequestSnapshot } from "../src/integrations/stripe-v2-request-snapshot.mjs";
import { buildBlockedV2CheckoutRequest } from "../src/integrations/stripe-v2-blocked-checkout-request.mjs";

const snapshot=makeV2CheckoutRequestSnapshot({
  orderId:"123e4567-e89b-42d3-a456-426614174000",
  ownerSubject:"synthetic_member_1",tier:"quick",
  idempotencyKey:"hwv2_request_preview_123456789"
});
const args={snapshot,returnOrigin:"https://sandbox.example.net",approvedReturnOrigin:"https://sandbox.example.net"};
test("pins v2 Checkout parameters to authentic immutable snapshot and blocks writes",()=>{
  const result=buildBlockedV2CheckoutRequest(args);
  assert.deepEqual(result.params.line_items,[{price:snapshot.terms.stripePriceId,quantity:1}]);
  assert.equal(result.params.client_reference_id,snapshot.terms.ownerSubject);
  assert.deepEqual(result.params.metadata,{orderId:snapshot.terms.orderId,consultationKey:"quick"});
  assert.equal(result.options.idempotencyKey,snapshot.terms.idempotencyKey);
  assert.equal(result.params.success_url,"https://sandbox.example.net/checkout/return?session_id={CHECKOUT_SESSION_ID}");
  assert.equal(result.params.cancel_url,"https://sandbox.example.net/consultations");
  assert.equal(result.snapshotSha256,snapshot.sha256);
  assert.equal(result.action,"blocked_request_preview");
  assert.equal(result.providerWriteAuthorized,false);
  assert.equal(result.release,"blocked");
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.params) &&
    Object.isFrozen(result.params.line_items) && Object.isFrozen(result.options));
});
test("same immutable terms produce exactly the same provider request preview",()=>{
  assert.deepEqual(buildBlockedV2CheckoutRequest(args),buildBlockedV2CheckoutRequest({...args}));
});
test("tampering owner, price, currency, quantity, mode, key or fingerprint is rejected",()=>{
  for(const changes of [
    {ownerSubject:"other"}, {stripePriceId:"price_Evil123"},
    {currency:"eur"},{quantity:2},{mode:"subscription"},
    {idempotencyKey:"hwv2_new_key_1234567890"}
  ]){
    assert.throws(()=>buildBlockedV2CheckoutRequest({...args,snapshot:{
      ...snapshot,terms:{...snapshot.terms,...changes}
    }}),/checkout_snapshot_integrity_mismatch/);
  }
  assert.throws(()=>buildBlockedV2CheckoutRequest({...args,snapshot:{
    ...snapshot,sha256:"f".repeat(64)
  }}),/checkout_snapshot_integrity_mismatch/);
});
test("unapproved, local, Replit, HTTP and injection-prone origins fail closed",()=>{
  for(const origin of [
    "http://sandbox.example.net",
    "https://sandbox.example.net:8443",
    "https://sandbox.example.net/path",
    "https://sandbox.example.net?redirect=evil",
    "https://user:pass@sandbox.example.net",
    "https://localhost",
    "https://legacy.replit.dev",
    "not a url"
  ]){
    assert.throws(()=>buildBlockedV2CheckoutRequest({
      ...args,returnOrigin:origin,approvedReturnOrigin:origin
    }),/checkout_origin_not_approved/);
  }
  // An attacker-chosen but otherwise well-formed HTTPS origin is rejected
  // when it disagrees with the independent server-owned approved origin.
  assert.throws(()=>buildBlockedV2CheckoutRequest({
    ...args,returnOrigin:"https://evil.example.net"
  }),/checkout_origin_not_approved/);
  assert.throws(()=>buildBlockedV2CheckoutRequest({
    ...args,approvedReturnOrigin:"https://unrelated.example.net"
  }),/checkout_origin_not_approved/);
});
test("missing snapshot fails without provider or network dependency",()=>{
  assert.throws(()=>buildBlockedV2CheckoutRequest({
    ...args,snapshot:undefined
  }),/checkout_snapshot_required/);
});
