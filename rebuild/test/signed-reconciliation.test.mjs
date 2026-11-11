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
