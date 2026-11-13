import test from "node:test";
import assert from "node:assert/strict";
import { reconcileSandboxPayment } from "../src/integrations/payment-reconciliation.mjs";

const order={id:"order1",userId:"user1",stripeSessionId:"cs_test_ABC123",status:"pending",amountMinor:1500,currency:"usd",consultationKey:"quick",configuredPriceId:"price_ABC123"};
const event={id:"evt_ABC123",type:"checkout.session.completed",livemode:false,data:{object:{id:"cs_test_ABC123",livemode:false,mode:"payment",payment_status:"paid",client_reference_id:"user1",amount_total:1500,currency:"usd",metadata:{orderId:"order1",consultationKey:"quick"}}}};
const item={quantity:1,amount_total:1500,price:{id:"price_ABC123",active:true,currency:"usd"}};
function fixture(response){
 const steps=[];let tx=false;
 const stripe={checkout:{sessions:{async listLineItems(){assert.equal(tx,false);steps.push("provider");return response;}}}};
 const repository={
  async findOrderBySession(){steps.push("snapshot");return order;},
  async transaction(fn){tx=true;steps.push("begin");try{return await fn({
   async lockOrderBySession(){steps.push("lock");return order;},
   async recordEventOnce(){steps.push("record");return true;},
   async applyDecision(d){steps.push("apply:"+d.action);}
  });}finally{tx=false;steps.push("end");}}
 };
 return {stripe,repository,steps};
}
test("incomplete provider pagination is retryable before transaction and event consumption",async()=>{
 for(const response of [null,{has_more:true,data:[item]},{has_more:false,data:null}]){
  const h=fixture(response);
  await assert.rejects(reconcileSandboxPayment({event,stripe:h.stripe,repository:h.repository}),/stripe_response_retryable/);
  assert.deepEqual(h.steps,["snapshot","provider"]);
 }
});
test("wrong provider price cannot grant entitlement",async()=>{
 const h=fixture({has_more:false,data:[{...item,price:{...item.price,id:"price_WRONG"}}]});
 const result=await reconcileSandboxPayment({event,stripe:h.stripe,repository:h.repository});
 assert.equal(result.action,"manual_review");
 assert.deepEqual(h.steps,["snapshot","provider","begin","lock","record","apply:manual_review","end"]);
});
test("extra provider line item cannot grant entitlement",async()=>{
 const h=fixture({has_more:false,data:[item,item]});
 const result=await reconcileSandboxPayment({event,stripe:h.stripe,repository:h.repository});
 assert.equal(result.action,"manual_review");
 assert.equal(h.steps.includes("apply:mark_paid"),false);
});
