import test from "node:test";
import assert from "node:assert/strict";
import { processSandboxWebhook } from "../src/integrations/stripe-webhook.mjs";
const order = { id:"order_1", userId:"user_1", stripeSessionId:"cs_test_abc", status:"pending", amountMinor:1500, currency:"usd", consultationKey:"quick", configuredPriceId:"price_Abc123" };
const event = { id:"evt_123abc", livemode:false, type:"checkout.session.completed", data:{ object:{ id:"cs_test_abc", livemode:false, payment_status:"paid", mode:"payment", client_reference_id:"user_1", amount_total:1500, currency:"usd", metadata:{orderId:"order_1", consultationKey:"quick"} } } };
const rawBody=Buffer.from('{"test":true}');
function harness(e=event, o=order) {
  const applied=[];let inserted=false;let inTransaction=false;const calls=[];
  const stripe={
    webhooks:{constructEvent:()=>e},
    checkout:{sessions:{listLineItems:async()=>{assert.equal(inTransaction,false,"provider call inside transaction");calls.push("provider");return ({has_more:false,data:[{quantity:1,amount_total:1500,price:{id:"price_Abc123",active:true,currency:"usd"}}]});}}}
  };
  const repository={findOrderBySession:async()=>o,transaction:async fn=>{inTransaction=true;try{return await fn({recordEventOnce:async()=>{if(inserted)return false;inserted=true;return true;},lockOrderBySession:async()=>o,applyDecision:async d=>{applied.push(d);}});}finally{inTransaction=false;}}};
  return {stripe,repository,applied,calls};
}
const params=h=>({rawBody,signature:"sig",endpointSecret:"whsec_test",stripe:h.stripe,repository:h.repository});
test("rejects unsigned webhook",async()=>{const h=harness();await assert.rejects(processSandboxWebhook({...params(h),signature:""}),/webhook_configuration_required/);});
test("rejects failed signature verification",async()=>{const h=harness();h.stripe.webhooks.constructEvent=()=>{throw Error("bad")};await assert.rejects(processSandboxWebhook(params(h)),/invalid_webhook_signature/);});
test("rejects live-mode event",async()=>{const h=harness({...event,livemode:true});await assert.rejects(processSandboxWebhook(params(h)),/sandbox_event_required/);});
test("accepts matching sandbox payment with transaction",async()=>{const h=harness();const result=await processSandboxWebhook(params(h));assert.equal(result.action,"mark_paid");assert.equal(h.applied[0].action,"mark_paid");});
test("duplicates do not apply twice",async()=>{const h=harness();await processSandboxWebhook(params(h));const result=await processSandboxWebhook(params(h));assert.equal(result.action,"duplicate");assert.equal(h.applied.length,1);});
test("wrong amount triggers manual review",async()=>{const h=harness({...event,data:{object:{...event.data.object,amount_total:1200}}});assert.equal((await processSandboxWebhook(params(h))).action,"manual_review");});
test("wrong currency triggers manual review",async()=>{const h=harness({...event,data:{object:{...event.data.object,currency:"eur"}}});assert.equal((await processSandboxWebhook(params(h))).action,"manual_review");});
test("wrong consultation triggers manual review",async()=>{const h=harness({...event,data:{object:{...event.data.object,metadata:{...event.data.object.metadata,consultationKey:"premium"}}}});assert.equal((await processSandboxWebhook(params(h))).action,"manual_review");});
test("unknown order fails closed",async()=>{const h=harness(event,null);await assert.rejects(processSandboxWebhook(params(h)),/unknown_order/);});
test("unknown event type fails closed",async()=>{const h=harness({...event,type:"customer.created"});await assert.rejects(processSandboxWebhook(params(h)),/sandbox_event_required/);assert.equal(h.applied.length,0);});
test("missing provider lookup fails closed",async()=>{const h=harness();delete h.stripe.checkout;await assert.rejects(processSandboxWebhook(params(h)),/stripe_lookup_required/);assert.equal(h.applied.length,0);});
test("incorrect provider price fails closed",async()=>{const h=harness();h.stripe.checkout.sessions.listLineItems=async()=>({has_more:false,data:[{quantity:1,amount_total:1500,price:{id:"price_Wrong",active:true,currency:"usd"}}]});assert.equal((await processSandboxWebhook(params(h))).action,"manual_review");});
test("incomplete provider pagination stays retryable",async()=>{const h=harness();h.stripe.checkout.sessions.listLineItems=async()=>({has_more:true,data:[]});await assert.rejects(processSandboxWebhook(params(h)),/stripe_response_retryable/);assert.equal(h.applied.length,0);});
test("missing authoritative stored price fails closed",async()=>{const h=harness(event,{...order,configuredPriceId:null});assert.equal((await processSandboxWebhook(params(h))).action,"manual_review");});
