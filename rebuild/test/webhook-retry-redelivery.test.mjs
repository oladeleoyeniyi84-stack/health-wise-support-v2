import test from "node:test";
import assert from "node:assert/strict";
import { processSandboxWebhook } from "../src/integrations/stripe-webhook.mjs";

const order={id:"order1",userId:"user1",stripeSessionId:"cs_test_Retry123",status:"pending",amountMinor:1500,currency:"usd",consultationKey:"quick",configuredPriceId:"price_Retry123"};
const event={id:"evt_Retry123",livemode:false,type:"checkout.session.completed",data:{object:{id:"cs_test_Retry123",livemode:false,mode:"payment",payment_status:"paid",client_reference_id:"user1",amount_total:1500,currency:"usd",metadata:{orderId:"order1",consultationKey:"quick"}}}};
test("transient provider outage permits safe redelivery and exactly one paid transition",async()=>{
 let unavailable=true,insideTransaction=false,recorded=false,applied=0,transactionCount=0,lookups=0;
 const stripe={
  webhooks:{constructEvent:()=>event},
  checkout:{sessions:{listLineItems:async()=>{assert.equal(insideTransaction,false);lookups++;if(unavailable)throw Error("transient network");return {has_more:false,data:[{quantity:1,amount_total:1500,price:{id:"price_Retry123",active:true,currency:"usd"}}]};}}}
 };
 const repository={
  findOrderBySession:async()=>order,
  transaction:async fn=>{transactionCount++;insideTransaction=true;try{return await fn({
   lockOrderBySession:async()=>order,
   recordEventOnce:async()=>{if(recorded)return false;recorded=true;return true;},
   applyDecision:async d=>{if(d.action==="mark_paid")applied++;}
  });}finally{insideTransaction=false;}}
 };
 const params={rawBody:Buffer.from("{}"),signature:"sig",endpointSecret:"whsec_test",stripe,repository};
 await assert.rejects(processSandboxWebhook(params),/stripe_lookup_retryable/);
 assert.equal(transactionCount,0);
 assert.equal(recorded,false);
 unavailable=false;
 const first=await processSandboxWebhook(params);
 assert.equal(first.action,"mark_paid");
 assert.equal(applied,1);
 const duplicate=await processSandboxWebhook(params);
 assert.equal(duplicate.action,"duplicate");
 assert.equal(applied,1);
 assert.equal(transactionCount,2);
 assert.equal(lookups,3);
});
