import test from "node:test";
import assert from "node:assert/strict";
import { processSandboxWebhook } from "../src/integrations/stripe-webhook.mjs";
const event={id:"evt_Test123",livemode:false,type:"checkout.session.completed",data:{object:{id:"cs_test_123",livemode:false,mode:"payment",payment_status:"paid",client_reference_id:"user1",amount_total:1500,currency:"usd",metadata:{orderId:"order1",consultationKey:"quick"}}}};
const order={id:"order1",userId:"user1",stripeSessionId:"cs_test_123",status:"pending",amountMinor:1500,currency:"usd",consultationKey:"quick",configuredPriceId:"price_Abc123"};
function run({items=[{quantity:1,amount_total:1500,price:{id:"price_Abc123",currency:"usd",active:true}}],hasMore=false,lookupError=false,overrideOrder=order}={}){
  const decisions=[];
  const stripe={webhooks:{constructEvent:()=>event},checkout:{sessions:{listLineItems:async()=>{if(lookupError)throw Error("provider unavailable");return {data:items,has_more:hasMore};}}}};
  const repository={transaction:async fn=>fn({recordEventOnce:async()=>true,lockOrderBySession:async()=>overrideOrder,applyDecision:async d=>{decisions.push(d);}})};
  return processSandboxWebhook({rawBody:Buffer.from("{}"),signature:"sig",endpointSecret:"whsec_test",stripe,repository}).then(result=>({result,decisions}));
}
test("provider outage does not mark order paid",async()=>{const r=await run({lookupError:true});assert.equal(r.result.action,"manual_review");assert.equal(r.decisions[0].action,"manual_review");});
test("provider item total mismatch does not mark order paid",async()=>{const r=await run({items:[{quantity:1,amount_total:1200,price:{id:"price_Abc123",currency:"usd",active:true}}]});assert.equal(r.result.action,"manual_review");});
test("multiple provider line items do not mark order paid",async()=>{const item={quantity:1,amount_total:1500,price:{id:"price_Abc123",currency:"usd",active:true}};const r=await run({items:[item,item]});assert.equal(r.result.action,"manual_review");});
test("incomplete Stripe pagination does not mark order paid",async()=>{const r=await run({hasMore:true});assert.equal(r.result.action,"manual_review");});
test("missing configured Stripe price does not mark order paid",async()=>{const r=await run({overrideOrder:{...order,configuredPriceId:null}});assert.equal(r.result.action,"manual_review");});
