import test from "node:test";
import assert from "node:assert/strict";
import { handleIsolatedSandboxWebhook } from "../src/integrations/isolated-sandbox-webhook-adapter.mjs";

const order={id:"order1",userId:"user1",stripeSessionId:"cs_test_abc",status:"pending",amountMinor:1500,
  currency:"usd",consultationKey:"quick",configuredPriceId:"price_Abc123"};
const baseEvent={id:"evt_Abc123",livemode:false,type:"checkout.session.completed",data:{object:{
  id:"cs_test_abc",livemode:false,mode:"payment",payment_status:"paid",client_reference_id:"user1",
  amount_total:1500,currency:"usd",metadata:{orderId:"order1",consultationKey:"quick"}
}}};
function fixture({event=baseEvent,signatureValid=true,lookupFails=false,dbFails=false}={}){
  const calls=[];
  const stripe={
    webhooks:{constructEvent:()=>{calls.push("verify");if(!signatureValid)throw Error("signature");return event;}},
    checkout:{sessions:{listLineItems:async()=>{calls.push("line_items");if(lookupFails)throw Error("stripe_outage");return {
      has_more:false,data:[{quantity:1,amount_total:1500,price:{id:"price_Abc123",active:true,currency:"usd"}}]
    };}}}
  };
  const repository={
    findOrderBySession:async()=>{calls.push("lookup");return order;},
    transaction:async work=>{calls.push("transaction");return work({
      lockOrderBySession:async()=>order,
      recordEventOnce:async()=>true,
      applyDecision:async()=>{if(dbFails)throw Error("database_unavailable");}
    });}
  };
  const input={method:"POST",headers:{"stripe-signature":"t=1,v1=signed","content-type":"application/json"},
    rawBody:Buffer.from(JSON.stringify(event)),endpointSecret:"whsec_syntheticFixture",stripe,repository};
  return {calls,input};
}
test("signed synthetic event is accepted only after verification and reconciliation",async()=>{
  const f=fixture();
  const result=await handleIsolatedSandboxWebhook(f.input);
  assert.equal(result.status,200);
  assert.deepEqual(f.calls,["verify","lookup","line_items","transaction"]);
  assert.deepEqual(result.body,{code:"accepted"});
  assert.equal(JSON.stringify(result).includes("whsec_"),false);
});
test("non-POST, bad content-type, absent signature and large/empty bodies reject without IO",async()=>{
  const modifications=[
    {method:"GET",expected:405},
    {headers:{"content-type":"text/plain","stripe-signature":"sig"},expected:415},
    {headers:{"content-type":"application/json"},expected:400},
    {rawBody:Buffer.alloc(262145),expected:413},
    {rawBody:Buffer.alloc(0),expected:413},
    {rawBody:"{}",expected:413}
  ];
  for(const {expected,...change} of modifications){
    const f=fixture();
    assert.equal((await handleIsolatedSandboxWebhook({...f.input,...change})).status,expected);
    assert.deepEqual(f.calls,[]);
  }
});
test("tampered signature and live-mode event cannot reach payment repository",async()=>{
  for(const options of [{signatureValid:false},{event:{...baseEvent,livemode:true}}]){
    const f=fixture(options);
    const result=await handleIsolatedSandboxWebhook(f.input);
    assert.equal(result.status,400);
    assert.deepEqual(f.calls,["verify"]);
  }
});
test("provider outage and database failure return retryable status instead of acknowledging event",async()=>{
  for(const options of [{lookupFails:true},{dbFails:true}]){
    const f=fixture(options);
    const result=await handleIsolatedSandboxWebhook(f.input);
    assert.equal(result.status,503);
    assert.equal(result.body.code,"reconciliation_unavailable");
  }
});
test("valid signed but inconsistent payment is acknowledged for manual review",async()=>{
  const event={...baseEvent,data:{object:{...baseEvent.data.object,amount_total:9999}}};
  const f=fixture({event});
  const result=await handleIsolatedSandboxWebhook(f.input);
  assert.equal(result.status,200);
  assert.deepEqual(f.calls,["verify","lookup","line_items","transaction"]);
});
test("missing signing configuration returns retryable error with no sensitive details",async()=>{
  const f=fixture();
  const result=await handleIsolatedSandboxWebhook({...f.input,endpointSecret:undefined});
  assert.equal(result.status,503);
  assert.deepEqual(f.calls,[]);
  assert.equal(JSON.stringify(result).includes("whsec_"),false);
});
