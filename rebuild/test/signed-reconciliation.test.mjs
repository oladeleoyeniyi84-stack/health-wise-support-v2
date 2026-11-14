import test from "node:test";
import assert from "node:assert/strict";
import { processSignedSandboxReconciliation } from "../src/integrations/signed-reconciliation.mjs";
const order={id:"order1",userId:"user1",stripeSessionId:"cs_test_abc",status:"pending",amountMinor:1500,currency:"usd",consultationKey:"quick",configuredPriceId:"price_Abc123"};
const event={id:"evt_Abc123",livemode:false,type:"checkout.session.completed",data:{object:{id:"cs_test_abc",livemode:false,mode:"payment",payment_status:"paid",client_reference_id:"user1",amount_total:1500,currency:"usd",metadata:{orderId:"order1",consultationKey:"quick"}}}};
function fixture(){
  const sequence=[];
  const stripe={webhooks:{constructEvent:()=>{sequence.push("verify");return event;}},checkout:{sessions:{listLineItems:async()=>{sequence.push("stripe");return {has_more:false,data:[{quantity:1,amount_total:1500,price:{id:"price_Abc123",active:true,currency:"usd"}}]};}}}};
  const repository={findOrderBySession:async()=>{sequence.push("snapshot");return order;},transaction:async work=>{sequence.push("begin");return work({lockOrderBySession:async()=>order,recordEventOnce:async()=>true,applyDecision:async()=>{}});}};
  return {stripe,repository,sequence,rawBody:Buffer.from("{}"),signature:"sig",endpointSecret:"whsec_test"};
}
test("signature precedes snapshot, provider lookup and transaction",async()=>{const f=fixture();const r=await processSignedSandboxReconciliation(f);assert.equal(r.action,"mark_paid");assert.deepEqual(f.sequence,["verify","snapshot","stripe","begin"]);});
test("invalid signature never reaches repository",async()=>{const f=fixture();f.stripe.webhooks.constructEvent=()=>{throw Error("bad")};await assert.rejects(processSignedSandboxReconciliation(f),/invalid_webhook_signature/);assert.deepEqual(f.sequence,[]);});
test("missing signature fails before verification",async()=>{const f=fixture();await assert.rejects(processSignedSandboxReconciliation({...f,signature:""}),/webhook_configuration_required/);assert.deepEqual(f.sequence,[]);});
test("live event rejected before repository access",async()=>{const f=fixture();f.stripe.webhooks.constructEvent=()=>({...event,livemode:true});await assert.rejects(processSignedSandboxReconciliation(f),/sandbox_event_required/);assert.deepEqual(f.sequence,[]);});


test("forged event type and invalid test session fail before repository access",async()=>{
  for(const changed of [
    {...event,type:"payment_intent.succeeded"},
    {...event,data:{object:{...event.data.object,id:"cs_live_invalid"}}}
  ]){
    const f=fixture();
    f.stripe.webhooks.constructEvent=()=>changed;
    await assert.rejects(processSignedSandboxReconciliation(f),/(sandbox_event_required|sandbox_session_required)/);
    assert.deepEqual(f.sequence,[]);
  }
});
test("signed but mismatched owner/order and tier cannot mark a payment paid",async()=>{
  for(const sessionChange of [
    {client_reference_id:"different_user"},
    {metadata:{orderId:"different_order",consultationKey:"quick"}},
    {metadata:{orderId:"order1",consultationKey:"premium"}},
    {amount_total:1600},
    {currency:"eur"},
    {payment_status:"unpaid"}
  ]){
    const f=fixture();
    f.stripe.webhooks.constructEvent=()=>({...event,data:{object:{...event.data.object,...sessionChange}}});
    const applied=[];
    f.repository.transaction=async work=>work({
      lockOrderBySession:async()=>order,
      recordEventOnce:async()=>true,
      applyDecision:async decision=>{applied.push(decision);}
    });
    const decision=await processSignedSandboxReconciliation(f);
    assert.equal(decision.action,"manual_review");
    assert.equal(applied.length,1);
    assert.equal(applied[0].action,"manual_review");
  }
});
test("duplicate signed event is not applied twice",async()=>{
  const f=fixture();
  let count=0;
  let eventRecorded=false;
  f.repository.transaction=async work=>work({
    lockOrderBySession:async()=>order,
    recordEventOnce:async()=>{if(eventRecorded)return false;eventRecorded=true;return true;},
    applyDecision:async()=>{count++;}
  });
  assert.equal((await processSignedSandboxReconciliation(f)).action,"mark_paid");
  assert.equal((await processSignedSandboxReconciliation(f)).action,"duplicate");
  assert.equal(count,1);
});
test("provider outage leaves signed webhook retryable with no transaction",async()=>{
  const f=fixture();
  f.stripe.checkout.sessions.listLineItems=async()=>{f.sequence.push("stripe");throw Error("simulated_outage");};
  await assert.rejects(processSignedSandboxReconciliation(f),/stripe_lookup_retryable/);
  assert.deepEqual(f.sequence,["verify","snapshot","stripe"]);
});
test("incomplete provider line items do not consume a signed event",async()=>{
  const f=fixture();
  f.stripe.checkout.sessions.listLineItems=async()=>{f.sequence.push("stripe");return {has_more:true,data:[]};};
  await assert.rejects(processSignedSandboxReconciliation(f),/stripe_response_retryable/);
  assert.deepEqual(f.sequence,["verify","snapshot","stripe"]);
});
test("invalid raw body is rejected before any Stripe SDK call",async()=>{
  for(const rawBody of [Buffer.alloc(0),Buffer.alloc(262145),{},null]){
    const f=fixture();
    await assert.rejects(processSignedSandboxReconciliation({...f,rawBody}),/invalid_raw_body/);
    assert.deepEqual(f.sequence,[]);
  }
});
test("database decision failure propagates for rollback and later retry",async()=>{
  const f=fixture();
  f.repository.transaction=async work=>work({
    lockOrderBySession:async()=>order,
    recordEventOnce:async()=>true,
    applyDecision:async()=>{throw Error("simulated_db_rollback");}
  });
  await assert.rejects(processSignedSandboxReconciliation(f),/simulated_db_rollback/);
  assert.deepEqual(f.sequence,["verify","snapshot","stripe"]);
});
