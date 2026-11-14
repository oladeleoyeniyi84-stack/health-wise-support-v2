import test from "node:test";
import assert from "node:assert/strict";
import { coordinateV2SandboxCheckoutPreparation } from "../src/integrations/stripe-v2-private-preparation-coordinator.mjs";
import { HEALTHWISE_V2_SANDBOX_ACCOUNT, HEALTHWISE_V2_SANDBOX_CATALOG } from "../src/integrations/stripe-v2-catalog.mjs";

const orderId="123e4567-e89b-42d3-a456-426614174000";
const item=HEALTHWISE_V2_SANDBOX_CATALOG.quick;
const secret="synthetic_only_hmac_secret_1234567890_no_real_keys";
function fixture({owner="member-123",active=false,status="pending"}={}){
  const calls=[],attempts=[];
  const saved={id:orderId,consultation_key:"quick",configured_price_id:item.priceId,amount_minor:"4900",currency:"usd",status,stripe_session_id:null};
  let journal=null;
  const pool={query:async(sql,params)=>{
    if(sql.includes("JOIN accounts a")) {
      calls.push("owner");
      return {rowCount:1,rows:[{id:orderId,status:saved.status,stripe_session_id:null,provider_subject:owner}]};
    }
    if(sql.startsWith("SELECT id, consultation_key")) {
      calls.push("order");
      return {rowCount:1,rows:[saved]};
    }
    if(sql.includes("INSERT INTO sandbox_checkout_attempts")) {
      calls.push("reserve");
      if(!journal){
        journal={order_id:orderId,configured_price_id:item.priceId,idempotency_key:params[5],state:"prepared",stripe_session_id:null,created_at:new Date()};
        attempts.push(journal.idempotency_key);
        return {rowCount:1,rows:[journal]};
      }
      return {rowCount:0,rows:[]};
    }
    if(sql.includes("JOIN sandbox_checkout_attempts a")){
      calls.push("journal");
      return {rowCount:1,rows:[{...saved,order_session:null,
        idempotency_key:journal.idempotency_key,state:"prepared",attempt_session:null,
        attempt_price:item.priceId,created_at:journal.created_at}]};
    }
    throw Error("unexpected_sql");
  }};
  const stripe={
    accounts:{retrieve:async()=>{calls.push("stripe_account");return {object:"account",id:HEALTHWISE_V2_SANDBOX_ACCOUNT};}},
    balance:{retrieve:async()=>({object:"balance",livemode:false})},
    prices:{retrieve:async()=>({id:item.priceId,active,livemode:false,type:"one_time",currency:"usd",unit_amount:4900,
      product:item.productId,metadata:{app:"healthwise-v2",tier:"quick"}})},
    products:{retrieve:async()=>({id:item.productId,active,livemode:false,metadata:{app:"healthwise-v2",tier:"quick"}})},
    checkout:{sessions:{create:async()=>{throw Error("unexpected_checkout_creation");}}}
  };
  const run=(subject="member-123",overrides={})=>coordinateV2SandboxCheckoutPreparation({
    stripe,pool,orderId,resolvePrincipal:async()=>({authenticated:true,providerSubject:subject}),
    serverKeySecret:secret,...overrides
  });
  return {run,calls,attempts};
}
test("inactive catalog rejects before reservation or any Checkout creation",async()=>{
  const f=fixture();
  await assert.rejects(f.run(),/v2_catalog_inactive/);
  assert.deepEqual(f.calls,["owner","order","stripe_account"]);
  assert.equal(f.attempts.length,0);
});
test("trusted owner prepares only, uses stable server HMAC, conceals idempotency key",async()=>{
  const f=fixture({active:true});
  const first=await f.run();
  const again=await f.run();
  assert.deepEqual(first,again);
  assert.deepEqual(first,{action:"prepared_only",orderId,consultationKey:"quick",amountCents:4900,currency:"usd",release:"blocked"});
  assert.ok(Object.isFrozen(first));
  assert.equal(f.attempts.length,1);
  assert.match(f.attempts[0],/^hwv2_[a-f0-9]{64}$/);
  assert.ok(!Object.hasOwn(first,"idempotencyKey"));
});
test("wrong owner rejects before provider access or database mutation",async()=>{
  const f=fixture({owner:"member-other",active:true});
  await assert.rejects(f.run(),/checkout_owner_mismatch/);
  assert.deepEqual(f.calls,["owner"]);
  assert.equal(f.attempts.length,0);
});
test("invalid or unauthenticated principal rejects before owner query",async()=>{
  for(const resolvePrincipal of [
    async()=>null,async()=>({authenticated:false,providerSubject:"member-123"}),
    async()=>({authenticated:true,providerSubject:""})
  ]){
    const f=fixture({active:true});
    await assert.rejects(f.run("member-123",{resolvePrincipal}),/authenticated_principal_required/);
    assert.deepEqual(f.calls,[]);
  }
});
test("invalid order ID or missing private server secret rejects without I/O",async()=>{
  const f=fixture({active:true});
  await assert.rejects(f.run("member-123",{orderId:"invalid"}),/invalid_order_id/);
  await assert.rejects(f.run("member-123",{serverKeySecret:"guessable"}),/server_secret_required/);
  assert.deepEqual(f.calls,[]);
});
test("nonpending order rejected before provider lookup",async()=>{
  const f=fixture({active:true,status:"paid"});
  await assert.rejects(f.run(),/checkout_order_not_eligible/);
  assert.deepEqual(f.calls,["owner"]);
});
