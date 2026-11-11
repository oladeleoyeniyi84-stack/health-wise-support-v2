import test from "node:test";
import assert from "node:assert/strict";
import { reconcileSandboxPayment } from "../src/integrations/payment-reconciliation.mjs";

const order={id:"order1",userId:"user1",stripeSessionId:"cs_test_ABC123",status:"pending",amountMinor:1500,currency:"usd",consultationKey:"quick",configuredPriceId:"price_ABC123"};
const event={id:"evt_ABC123",type:"checkout.session.completed",livemode:false,data:{object:{id:"cs_test_ABC123",livemode:false,mode:"payment",payment_status:"paid",client_reference_id:"user1",amount_total:1500,currency:"usd",metadata:{orderId:"order1",consultationKey:"quick"}}}};
const providerResponse={has_more:false,data:[{quantity:1,amount_total:1500,price:{id:"price_ABC123",active:true,currency:"usd"}}]};
function harness({provider=async()=>providerResponse,fresh=order}={}){
 const steps=[];let inTransaction=false;
 const stripe={checkout:{sessions:{listLineItems:async(...args)=>{assert.equal(inTransaction,false,"provider call must be outside DB transaction");steps.push("provider");return provider(...args);}}}};
 const repository={
  async findOrderBySession(){steps.push("snapshot");return order;},
  async transaction(fn){steps.push("begin");inTransaction=true;try{return await fn({
   async lockOrderBySession(){steps.push("lock");return fresh;},
   async recordEventOnce(){steps.push("record");return true;},
   async applyDecision(decision){steps.push("apply:"+decision.action);}
  });}finally{inTransaction=false;steps.push("end");}}
 };
 return {stripe,repository,steps};
}
test("provider lookup completes before transaction begins",async()=>{
 const h=harness();const result=await reconcileSandboxPayment({event,stripe:h.stripe,repository:h.repository});
 assert.equal(result.action,"mark_paid");
 assert.deepEqual(h.steps,["snapshot","provider","begin","lock","record","apply:mark_paid","end"]);
});
test("provider outage remains retryable without consuming event or opening transaction",async()=>{
 const h=harness({provider:async()=>{throw Error("network unavailable");}});
 await assert.rejects(reconcileSandboxPayment({event,stripe:h.stripe,repository:h.repository}),/stripe_lookup_retryable/);
 assert.deepEqual(h.steps,["snapshot","provider"]);
});
test("changed order price after provider lookup cannot mark paid",async()=>{
 const h=harness({fresh:{...order,configuredPriceId:"price_DIFFERENT"}});
 const result=await reconcileSandboxPayment({event,stripe:h.stripe,repository:h.repository});
 assert.equal(result.action,"manual_review");
 assert.equal(h.steps.includes("apply:mark_paid"),false);
});
