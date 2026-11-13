import test from "node:test";
import assert from "node:assert/strict";
import { reconcileSandboxPayment } from "../src/integrations/payment-reconciliation.mjs";
const order={id:"order1",userId:"user1",stripeSessionId:"cs_test_abc",status:"pending",amountMinor:1500,currency:"usd",consultationKey:"quick",configuredPriceId:"price_Abc123"};
const event={id:"evt_Abc123",livemode:false,type:"checkout.session.completed",data:{object:{id:"cs_test_abc",livemode:false,mode:"payment",payment_status:"paid",client_reference_id:"user1",amount_total:1500,currency:"usd",metadata:{orderId:"order1",consultationKey:"quick"}}}};
function harness({changed={},providerFails=false}={}){
 const sequence=[],decisions=[];
 const stripe={checkout:{sessions:{listLineItems:async()=>{sequence.push("provider");if(providerFails)throw Error("network");return {has_more:false,data:[{quantity:1,amount_total:1500,price:{id:"price_Abc123",active:true,currency:"usd"}}]};}}}};
 const repository={findOrderBySession:async()=>{sequence.push("snapshot");return order;},transaction:async fn=>{sequence.push("begin");return fn({lockOrderBySession:async()=>({...order,...changed}),recordEventOnce:async()=>true,applyDecision:async d=>{decisions.push(d);}});}};
 return {stripe,repository,sequence,decisions};
}
test("provider lookup happens before transaction begins",async()=>{const h=harness();assert.equal((await reconcileSandboxPayment({event,...h})).action,"mark_paid");assert.deepEqual(h.sequence,["snapshot","provider","begin"]);});
test("changed price binding fails closed after re-lock",async()=>{const h=harness({changed:{configuredPriceId:"price_Other"}});assert.equal((await reconcileSandboxPayment({event,...h})).action,"manual_review");});
test("changed amount fails closed after re-lock",async()=>{const h=harness({changed:{amountMinor:1600}});assert.equal((await reconcileSandboxPayment({event,...h})).action,"manual_review");});
test("provider outage preserves retry and never begins transaction",async()=>{const h=harness({providerFails:true});await assert.rejects(reconcileSandboxPayment({event,...h}),/stripe_lookup_retryable/);assert.deepEqual(h.sequence,["snapshot","provider"]);assert.deepEqual(h.decisions,[]);});
test("live event rejected before database read",async()=>{const h=harness();await assert.rejects(reconcileSandboxPayment({event:{...event,livemode:true},...h}),/sandbox_event_required/);assert.deepEqual(h.sequence,[]);});

test("missing Stripe SDK lookup does not consume event",async()=>{
 const h=harness();h.stripe.checkout.sessions.listLineItems=undefined;
 await assert.rejects(reconcileSandboxPayment({event,...h}),/stripe_lookup_required/);
 assert.deepEqual(h.sequence,["snapshot"]);
 assert.deepEqual(h.decisions,[]);
});
test("incomplete Stripe response does not consume event",async()=>{
 const h=harness();h.stripe.checkout.sessions.listLineItems=async()=>{h.sequence.push("provider");return {has_more:true,data:[]};};
 await assert.rejects(reconcileSandboxPayment({event,...h}),/stripe_response_retryable/);
 assert.deepEqual(h.sequence,["snapshot","provider"]);
 assert.deepEqual(h.decisions,[]);
});
test("confirmed mismatched line item remains manual review",async()=>{
 const h=harness();h.stripe.checkout.sessions.listLineItems=async()=>{h.sequence.push("provider");return {has_more:false,data:[{quantity:1,amount_total:1600,price:{id:"price_Abc123",active:true,currency:"usd"}}]};};
 assert.equal((await reconcileSandboxPayment({event,...h})).action,"manual_review");
 assert.equal(h.decisions.length,1);
});
