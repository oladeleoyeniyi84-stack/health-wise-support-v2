import test from "node:test";
import assert from "node:assert/strict";
import { reserveSandboxCheckoutAttempt } from "../src/integrations/sandbox-checkout-attempts.mjs";
const orderId="123e4567-e89b-42d3-a456-426614174000",priceId="price_Abc123",idempotencyKey="healthwise_checkout_attempt_12345";
const record={order_id:orderId,configured_price_id:priceId,idempotency_key:idempotencyKey,state:"prepared",stripe_session_id:null,created_at:new Date("2026-11-13T00:00:00Z")};
const args=(pool,overrides={})=>({pool,orderId,priceId,idempotencyKey,...overrides});
test("fresh attempt creates one prepared immutable journal record before any provider call",async()=>{
  const calls=[];const pool={query:async(sql,params)=>{calls.push({sql,params});return {rowCount:1,rows:[record]};}};
  const out=await reserveSandboxCheckoutAttempt(args(pool));
  assert.equal(out.idempotencyKey,idempotencyKey);
  assert.equal(out.state,"prepared");assert.ok(Object.isFrozen(out));
  assert.equal(calls.length,1);
  assert.match(calls[0].sql,/INSERT INTO sandbox_checkout_attempts/);
  assert.match(calls[0].sql,/ON CONFLICT \(order_id\) DO NOTHING/);
  assert.match(calls[0].sql,/status = 'pending'/);
  assert.match(calls[0].sql,/stripe_session_id IS NULL/);
  assert.deepEqual(calls[0].params,[orderId,priceId,idempotencyKey]);
});
test("repeated reservation returns same prepared record and never creates another key",async()=>{
  let calls=0;const pool={query:async()=>++calls===1?{rowCount:0,rows:[]}:{rowCount:1,rows:[record]}};
  const out=await reserveSandboxCheckoutAttempt(args(pool));
  assert.equal(out.idempotencyKey,idempotencyKey);assert.equal(calls,2);
});
test("conflicting key, price, bound session or manual review fail closed",async()=>{
  for(const change of [
    {idempotency_key:"another_key_123456789"},
    {configured_price_id:"price_legacy"},
    {state:"manual_review"},
    {stripe_session_id:"cs_test_alreadyBound"}
  ]){
    let calls=0;const pool={query:async()=>++calls===1?{rowCount:0,rows:[]}:{rowCount:1,rows:[{...record,...change}]}};
    await assert.rejects(reserveSandboxCheckoutAttempt(args(pool)),/checkout_attempt_conflict/);
  }
});
test("refuses malformed identifiers before DB access",async()=>{
  let count=0;const pool={query:async()=>{count++;throw Error("unexpected");}};
  for(const change of [{orderId:"bad"},{priceId:"not_price"},{idempotencyKey:"short"}]){
    await assert.rejects(reserveSandboxCheckoutAttempt(args(pool,change)),/invalid_/);
  }
  assert.equal(count,0);
});
test("missing order or unexpected database failure does not create a reservation",async()=>{
  let n=0;
  await assert.rejects(reserveSandboxCheckoutAttempt(args({query:async()=>++n===1?{rowCount:0,rows:[]}:{rowCount:0,rows:[]}})),/checkout_attempt_conflict/);
  await assert.rejects(reserveSandboxCheckoutAttempt(args({query:async()=>{throw Error("db_down");}})),/db_down/);
});
