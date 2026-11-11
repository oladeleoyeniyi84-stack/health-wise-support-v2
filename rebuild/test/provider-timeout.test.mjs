import test from "node:test";
import assert from "node:assert/strict";
import { reconcileSandboxPayment } from "../src/integrations/payment-reconciliation.mjs";

const event={id:"evt_timeout1",livemode:false,type:"checkout.session.completed",data:{object:{id:"cs_test_timeout1"}}};
const order={id:"order1",stripeSessionId:"cs_test_timeout1",status:"pending",amountMinor:1500,currency:"usd",consultationKey:"quick",configuredPriceId:"price_123",userId:"user1"};

test("never-resolving provider lookup fails retryably without starting transaction",async()=>{
 let transactions=0,lookups=0;
 const repository={findOrderBySession:async()=>order,transaction:async()=>{transactions++;throw Error("unexpected transaction");}};
 const stripe={checkout:{sessions:{listLineItems:()=>{lookups++;return new Promise(()=>{});}}}};
 await assert.rejects(reconcileSandboxPayment({event,stripe,repository,providerTimeoutMs:25}),/stripe_lookup_retryable/);
 assert.equal(lookups,1);
 assert.equal(transactions,0);
});

test("provider timeout setting is bounded and cannot be disabled",async()=>{
 const repository={findOrderBySession:async()=>{throw Error("unexpected lookup");},transaction:async()=>{}};
 for(const providerTimeoutMs of [0,-1,10001,NaN,1.5]){
  await assert.rejects(reconcileSandboxPayment({event,repository,providerTimeoutMs}),/invalid_provider_timeout/);
 }
});

test("late provider completion after timeout cannot apply a payment",async()=>{
 let finishLookup,transactions=0;
 const providerResponse=new Promise(resolve=>{finishLookup=resolve;});
 const repository={findOrderBySession:async()=>order,transaction:async()=>{transactions++;throw Error("late transaction");}};
 const stripe={checkout:{sessions:{listLineItems:()=>providerResponse}}};
 await assert.rejects(reconcileSandboxPayment({event,stripe,repository,providerTimeoutMs:10}),/stripe_lookup_retryable/);
 finishLookup({has_more:false,data:[{quantity:1,amount_total:1500,price:{id:"price_123",active:true,currency:"usd"}}]});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(transactions,0);
});
