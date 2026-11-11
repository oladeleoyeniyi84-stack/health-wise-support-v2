import test from "node:test";
import assert from "node:assert/strict";
import { processSandboxWebhook } from "../src/integrations/stripe-webhook.mjs";
const event={id:"evt_Test123",livemode:false,type:"checkout.session.completed",data:{object:{id:"cs_test_123",livemode:false,mode:"payment",payment_status:"paid",client_reference_id:"user1",amount_total:1500,currency:"usd",metadata:{orderId:"order1",consultationKey:"quick"}}}};
const order={id:"order1",userId:"user1",stripeSessionId:"cs_test_123",status:"pending",amountMinor:1500,currency:"usd",consultationKey:"quick",configuredPriceId:"price_Abc123"};
function run({items=[{quantity:1,amount_total:1500,price:{id:"price_Abc123",currency:"usd",active:true}}],hasMore=false,lookupError=false,overrideOrder=order}={}){
 const decisions=[];let inTransaction=false;let transactionCount=0;
 const stripe={webhooks:{constructEvent:()=>event},checkout:{sessions:{listLineItems:async()=>{assert.equal(inTransaction,false,"provider call inside transaction");if(lookupError)throw Error("provider unavailable");return {data:items,has_more:hasMore};}}}};
 const repository={
  findOrderBySession:async()=>overrideOrder,
  transaction:async fn=>{transactionCount++;inTransaction=true;try{return await fn({
   recordEventOnce:async()=>true,lockOrderBySession:async()=>overrideOrder,
   applyDecision:async d=>{decisions.push(d);}
  });}finally{inTransaction=false;}}
 };
 const promise=processSandboxWebhook({rawBody:Buffer.from("{}"),signature:"sig",endpointSecret:"whsec_test",stripe,repository});
 return {promise,decisions,getTransactionCount:()=>transactionCount};
}
test("provider outage is retryable without consuming event or starting transaction",async()=>{
 const h=run({lookupError:true});
 await assert.rejects(h.promise,/stripe_lookup_retryable/);
 assert.equal(h.decisions.length,0);assert.equal(h.getTransactionCount(),0);
});
test("provider item total mismatch does not mark order paid",async()=>{
 const h=run({items:[{quantity:1,amount_total:1200,price:{id:"price_Abc123",currency:"usd",active:true}}]});
 assert.equal((await h.promise).action,"manual_review");assert.equal(h.decisions[0].action,"manual_review");
});
test("multiple provider line items do not mark order paid",async()=>{
 const item={quantity:1,amount_total:1500,price:{id:"price_Abc123",currency:"usd",active:true}};
 const h=run({items:[item,item]});assert.equal((await h.promise).action,"manual_review");
});
test("incomplete Stripe pagination is retryable without event consumption",async()=>{
 const h=run({hasMore:true});await assert.rejects(h.promise,/stripe_response_retryable/);
 assert.equal(h.decisions.length,0);assert.equal(h.getTransactionCount(),0);
});
test("missing configured Stripe price does not mark order paid",async()=>{
 const h=run({overrideOrder:{...order,configuredPriceId:null}});
 assert.equal((await h.promise).action,"manual_review");
});
