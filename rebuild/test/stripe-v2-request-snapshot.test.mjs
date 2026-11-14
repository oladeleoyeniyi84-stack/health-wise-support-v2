import test from "node:test";
import assert from "node:assert/strict";
import { makeV2CheckoutRequestSnapshot,persistV2CheckoutRequestSnapshot } from "../src/integrations/stripe-v2-request-snapshot.mjs";
const orderId="123e4567-e89b-42d3-a456-426614174000";
const base={orderId,ownerSubject:"member_123",tier:"quick",idempotencyKey:"hwv2_fixture_123456789012345"};
test("canonical pinned test-only snapshot is stable and immutable",()=>{
 const a=makeV2CheckoutRequestSnapshot(base);
 const b=makeV2CheckoutRequestSnapshot({...base});
 assert.deepEqual(a,b);
 assert.ok(Object.isFrozen(a) && Object.isFrozen(a.terms));
 assert.match(a.sha256,/^[0-9a-f]{64}$/);
 assert.equal(a.terms.amountCents,4900);
 assert.equal(a.terms.currency,"usd");
 assert.equal(a.terms.livemode,false);
 assert.equal(a.terms.quantity,1);
 assert.ok(!Object.hasOwn(a.terms,"successUrl"));
});
test("different owner, tier or key produces different digest",()=>{
 const original=makeV2CheckoutRequestSnapshot(base);
 for(const diff of [
   {ownerSubject:"other_member"},{tier:"full"},{idempotencyKey:"hwv2_otherkey_1234567890123"}
 ])assert.notEqual(makeV2CheckoutRequestSnapshot({...base,...diff}).sha256,original.sha256);
});
test("first persisted request and exact retry cannot modify snapshot",async()=>{
 const snapshot=makeV2CheckoutRequestSnapshot(base);
 const values=[];
 let calls=0;
 const pool={query:async(sql,args)=>{
   values.push({sql,args});
   return ++calls===1
     ? {rowCount:1,rows:[{request_sha256:snapshot.sha256}]}
     : calls===2 ? {rowCount:0,rows:[]}
     : {rowCount:1,rows:[{request_sha256:snapshot.sha256,owner_subject:base.ownerSubject,
       configured_price_id:snapshot.terms.stripePriceId,amount_minor:"4900",currency:"usd",
       idempotency_key:base.idempotencyKey}]};
 }};
 assert.equal((await persistV2CheckoutRequestSnapshot({pool,snapshot})).action,"snapshot_recorded");
 assert.equal((await persistV2CheckoutRequestSnapshot({pool,snapshot})).action,"snapshot_already_recorded");
 assert.equal(values.length,3);
 assert.ok(values[0].sql.includes("ON CONFLICT (order_id) DO NOTHING"));
 assert.ok(values[2].sql.includes("JOIN consultation_orders"));
});
test("invalid or tampered snapshot rejected without database access",async()=>{
 const s=makeV2CheckoutRequestSnapshot(base);let accesses=0;
 const pool={query:async()=>{accesses++;throw Error("unexpected_write");}};
 for(const bad of [{...s,sha256:"0".repeat(64)},{...s,terms:{...s.terms,amountCents:9900}},{...s,terms:{...s.terms,livemode:true}}])
  await assert.rejects(persistV2CheckoutRequestSnapshot({pool,snapshot:bad}),/snapshot_integrity_mismatch/);
 assert.equal(accesses,0);
});
test("mismatched prior journal or incomplete insert fail closed",async()=>{
 const s=makeV2CheckoutRequestSnapshot(base);
 for(const second of [
  {rowCount:0,rows:[]},
  {rowCount:1,rows:[{request_sha256:"f".repeat(64),owner_subject:base.ownerSubject}]}
 ]){
  let count=0;
  const pool={query:async()=>++count===1?{rowCount:0,rows:[]}:second};
  await assert.rejects(persistV2CheckoutRequestSnapshot({pool,snapshot:s}),/snapshot_conflict/);
 }
});
