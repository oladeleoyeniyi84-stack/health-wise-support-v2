import test from "node:test";
import assert from "node:assert/strict";
import { reserveVerifiedV2SandboxAttempt } from "../src/integrations/stripe-v2-verified-attempt-reservation.mjs";
const orderId="123e4567-e89b-42d3-a456-426614174000";
const priceId="price_1UbQvoDSAM5aSpF4YcfIcscG";
const idempotencyKey="healthwise_attempt_guard_1234567";
const base={orderId,priceId,amountCents:4900,currency:"usd",tier:"quick",idempotencyKey};
const journal={order_id:orderId,configured_price_id:priceId,idempotency_key:idempotencyKey,state:"prepared",stripe_session_id:null,created_at:new Date("2026-11-14T00:00:00Z")};
const observed={id:orderId,status:"pending",configured_price_id:priceId,amount_minor:"4900",currency:"usd",consultation_key:"quick",order_session:null,idempotency_key:idempotencyKey,state:"prepared",attempt_session:null,attempt_price:priceId,created_at:journal.created_at};
test("fresh v2 reservation atomically compares price, amount, currency, tier and pending state",async()=>{
  const calls=[];
  const pool={query:async(sql,values)=>{calls.push({sql,values});return {rowCount:1,rows:[journal]};}};
  const out=await reserveVerifiedV2SandboxAttempt({pool,...base});
  assert.equal(out.state,"prepared");assert.ok(Object.isFrozen(out));
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].values,[orderId,priceId,4900,"usd","quick",idempotencyKey]);
  for(const condition of ["o.amount_minor = $3","o.currency = $4","o.consultation_key = $5","o.status = 'pending'","o.stripe_session_id IS NULL"])assert.ok(calls[0].sql.includes(condition));
});
test("same immutable attempt allows an idempotent read-only retry",async()=>{
  let count=0;
  const pool={query:async()=>++count===1?{rowCount:0,rows:[]}:{rowCount:1,rows:[observed]}};
  const out=await reserveVerifiedV2SandboxAttempt({pool,...base});
  assert.equal(out.idempotencyKey,idempotencyKey);
  assert.equal(count,2);
});
test("race changing monetary fields, price or key fails closed",async()=>{
  for(const changed of [
    {amount_minor:"9900"},{currency:"eur"},{consultation_key:"full"},
    {configured_price_id:"price_Legacy"},{idempotency_key:"healthwise_wrong_key_123456"},
    {status:"paid"},{order_session:"cs_test_preexisting"},
    {state:"manual_review"},{attempt_price:"price_Legacy"}
  ]){
    let count=0;
    const pool={query:async()=>++count===1?{rowCount:0,rows:[]}:{rowCount:1,rows:[{...observed,...changed}]}};
    await assert.rejects(reserveVerifiedV2SandboxAttempt({pool,...base}),/checkout_attempt_conflict/);
  }
});
test("missing or ambiguous journal and malformed inputs never return a permit",async()=>{
  await assert.rejects(reserveVerifiedV2SandboxAttempt({pool:{query:async()=>({rowCount:2,rows:[]})},...base}),/attempt_ambiguous/);
  let n=0;
  const pool={query:async()=>{n++;throw Error("unexpected");}};
  for(const edit of [{orderId:"bad"},{priceId:"legacy"},{amountCents:-1},{currency:"eur"},{tier:"unknown"},{idempotencyKey:"short"}])
    await assert.rejects(reserveVerifiedV2SandboxAttempt({pool,...base,...edit}),/invalid_/);
  assert.equal(n,0);
});
