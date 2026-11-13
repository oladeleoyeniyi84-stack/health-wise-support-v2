import test from "node:test";
import assert from "node:assert/strict";
import { bindSandboxCheckoutSession } from "../src/integrations/sandbox-session-binding.mjs";

const orderId="123e4567-e89b-42d3-a456-426614174000";
const sessionId="cs_test_abc123";
const priceId="price_abc123";
const args=(pool,changes={})=>({pool,orderId,sessionId,priceId,...changes});

test("new sandbox session binding uses guarded atomic SQL and positional parameters",async()=>{
  const calls=[];
  const pool={query:async(sql,params)=>{calls.push({sql,params});return {rowCount:1,rows:[{id:orderId,stripe_session_id:sessionId}]};}};
  assert.deepEqual(await bindSandboxCheckoutSession(args(pool)),{orderId,sessionId,action:"bound"});
  assert.equal(calls.length,1);
  assert.match(calls[0].sql,/UPDATE consultation_orders/);
  assert.match(calls[0].sql,/status = 'pending'/);
  assert.match(calls[0].sql,/configured_price_id = \$3/);
  assert.match(calls[0].sql,/stripe_session_id IS NULL/);
  assert.deepEqual(calls[0].params,[orderId,sessionId,priceId]);
});
test("retry of same binding is accepted only when still pending with identical price",async()=>{
  const calls=[];
  const pool={query:async(sql)=>{calls.push(sql);return calls.length===1?{rowCount:0,rows:[]}:{rowCount:1,rows:[{stripe_session_id:sessionId,configured_price_id:priceId,status:"pending"}]};}};
  assert.deepEqual(await bindSandboxCheckoutSession(args(pool)),{orderId,sessionId,action:"already_bound"});
  assert.equal(calls.length,2);
});
test("conflicting session, price or order status is rejected",async()=>{
  for(const row of [
    {stripe_session_id:"cs_test_other",configured_price_id:priceId,status:"pending"},
    {stripe_session_id:sessionId,configured_price_id:"price_other",status:"pending"},
    {stripe_session_id:sessionId,configured_price_id:priceId,status:"paid"},
    null
  ]){
    let n=0;
    const pool={query:async()=>{n++;return n===1?{rowCount:0,rows:[]}:{rowCount:row?1:0,rows:row?[row]:[]};}};
    await assert.rejects(bindSandboxCheckoutSession(args(pool)),/session_binding_conflict/);
  }
});
test("rejects invalid IDs before database access and rejects ambiguous updates",async()=>{
  let calls=0;
  const pool={query:async()=>{calls++;return {rowCount:2,rows:[]};}};
  for(const changes of [
    {sessionId:"cs_live_xyz"},
    {sessionId:"cs_test_invalid-hyphen"},
    {priceId:"legacy"},
    {orderId:"order_123"}
  ]) await assert.rejects(bindSandboxCheckoutSession(args(pool,changes)),/invalid_/);
  assert.equal(calls,0);
  await assert.rejects(bindSandboxCheckoutSession(args(pool)),/binding_ambiguous/);
  assert.equal(calls,1);
});
test("database errors propagate without silent retries or reassignment",async()=>{
  const pool={query:async()=>{throw new Error("db_unavailable");}};
  await assert.rejects(bindSandboxCheckoutSession(args(pool)),/db_unavailable/);
});
