import test from "node:test";
import assert from "node:assert/strict";
import { prepareV2SandboxCheckoutAttempt } from "../src/integrations/stripe-v2-checkout-preparation.mjs";
import { HEALTHWISE_V2_SANDBOX_ACCOUNT, HEALTHWISE_V2_SANDBOX_CATALOG } from "../src/integrations/stripe-v2-catalog.mjs";

const orderId="123e4567-e89b-42d3-a456-426614174000";
const price=HEALTHWISE_V2_SANDBOX_CATALOG.quick;
const key="healthwise_prep_attempt_123456789";
const stored={id:orderId,consultation_key:"quick",configured_price_id:price.priceId,amount_minor:"4900",currency:"usd",status:"pending",stripe_session_id:null};
function fixture({active=false,accountId=HEALTHWISE_V2_SANDBOX_ACCOUNT,livemode=false,order=stored}={}) {
  const calls=[];
  const db={order,attempt:null};
  const pool={query:async(sql,params)=>{
    if(sql.startsWith("SELECT id, consultation_key")) {
      calls.push("read_order");
      return {rowCount:db.order?1:0,rows:db.order?[db.order]:[]};
    }
    if(sql.includes("INSERT INTO sandbox_checkout_attempts")) {
      calls.push("reserve");
      if(!db.order || db.order.status!=="pending" || db.order.stripe_session_id != null ||
         db.order.configured_price_id!==params[1] || Number(db.order.amount_minor)!==params[2] ||
         db.order.currency!==params[3] || db.order.consultation_key!==params[4]) return {rowCount:0,rows:[]};
      if(db.attempt)return {rowCount:0,rows:[]};
      db.attempt={order_id:orderId,configured_price_id:params[1],idempotency_key:params[5],
        state:"prepared",stripe_session_id:null,created_at:new Date()};
      return {rowCount:1,rows:[db.attempt]};
    }
    if(sql.includes("JOIN sandbox_checkout_attempts a")) {
      calls.push("read_attempt");
      const observed = db.attempt && db.order ? {
        ...db.order,order_session:db.order.stripe_session_id,
        idempotency_key:db.attempt.idempotency_key,state:db.attempt.state,
        attempt_session:db.attempt.stripe_session_id,attempt_price:db.attempt.configured_price_id,
        created_at:db.attempt.created_at
      } : null;
      return {rowCount:observed?1:0,rows:observed?[observed]:[]};
    }
    throw Error("unexpected_sql");
  }};
  const stripe={
    accounts:{retrieve:async()=>{calls.push("account");return {object:"account",id:accountId};}},
    balance:{retrieve:async()=>{calls.push("balance");return {object:"balance",livemode};}},
    prices:{retrieve:async()=>{calls.push("price");return {
      id:price.priceId,livemode:false,currency:"usd",type:"one_time",product:price.productId,
      unit_amount:4900,metadata:{app:"healthwise-v2",tier:"quick"},active
    };}},
    products:{retrieve:async()=>{calls.push("product");return {
      id:price.productId,livemode:false,metadata:{app:"healthwise-v2",tier:"quick"},active
    };}},
    checkout:{sessions:{create:async()=>{throw Error("checkout_write_forbidden");}}}
  };
  return {stripe,pool,calls,db};
}
const run=(f,overrides={})=>prepareV2SandboxCheckoutAttempt({stripe:f.stripe,pool:f.pool,orderId,idempotencyKey:key,...overrides});

test("inactive catalog blocks before any journal write or provider Checkout creation",async()=>{
  const f=fixture();
  await assert.rejects(run(f),/v2_catalog_inactive/);
  assert.deepEqual(f.calls,["read_order","account","balance","price","product"]);
  assert.equal(f.db.attempt,null);
});
test("validated active test fixture prepares one durable attempt but never creates Checkout",async()=>{
  const f=fixture({active:true});
  const receipt=await run(f);
  assert.deepEqual(receipt,{action:"prepared_only",orderId,consultationKey:"quick",amountCents:4900,currency:"usd",idempotencyKey:key});
  assert.ok(Object.isFrozen(receipt));
  assert.deepEqual(f.calls,["read_order","account","balance","price","product","reserve"]);
  const retried=await run(f);
  assert.deepEqual(retried,receipt);
  assert.equal(f.calls.filter(x=>x==="reserve").length,2);
  assert.equal(f.calls.filter(x=>x==="read_attempt").length,1);
});
test("wrong account or live mode fails before any reservation",async()=>{
  for(const options of [{accountId:"acct_wrong"},{livemode:true}]){
    const f=fixture({...options,active:true});
    await assert.rejects(run(f),/(stripe_sandbox_account_mismatch|stripe_test_mode_required)/);
    assert.ok(!f.calls.includes("reserve"));
  }
});
test("price, amount, currency and status mismatches fail closed",async()=>{
  for(const order of [
    {...stored,configured_price_id:"price_legacy"},
    {...stored,amount_minor:"9900"},
    {...stored,currency:"eur"},
    {...stored,status:"paid"},
    {...stored,stripe_session_id:"cs_test_already"}
  ]) {
    const f=fixture({active:true,order});
    await assert.rejects(run(f),/(checkout_order_price_mismatch|checkout_order_not_eligible)/);
    assert.ok(!f.calls.includes("reserve"));
  }
});
test("changed order after preflight cannot make a second reservation",async()=>{
  const f=fixture({active:true});
  const original=f.stripe.products.retrieve;
  f.stripe.products.retrieve=async(...args)=>{
    const product=await original(...args);
    f.db.order={...f.db.order,status:"paid"};
    return product;
  };
  await assert.rejects(run(f),/checkout_attempt_conflict/);
  assert.equal(f.db.attempt,null);
});
test("invalid identifiers and missing orders fail before Stripe calls",async()=>{
  const f=fixture({active:true});
  await assert.rejects(run(f,{orderId:"bad"}),/invalid_order_id/);
  await assert.rejects(run(f,{idempotencyKey:"short"}),/invalid_idempotency_key/);
  assert.deepEqual(f.calls,[]);
  const missing=fixture({active:true,order:null});
  await assert.rejects(run(missing),/checkout_order_missing/);
  assert.deepEqual(missing.calls,["read_order"]);
});
