import test from "node:test";
import assert from "node:assert/strict";
import { verifyOrphanSandboxSession } from "../src/integrations/sandbox-orphan-provider-lookup.mjs";
const orderId="123e4567-e89b-42d3-a456-426614174000";
const account="acct_1T36fzDSAM5aSpF4";
const sessionId="cs_test_Orphan123";
const priceId="price_1UbQvoDSAM5aSpF4YcfIcscG";
const session={id:sessionId,livemode:false,mode:"payment",status:"open",client_reference_id:"user_abc",metadata:{orderId,consultationKey:"quick"},amount_total:4900,currency:"usd"};
const lineItems={has_more:false,data:[{quantity:1,amount_total:4900,price:{id:priceId}}]};
function client({s=session,items=lineItems}={}){
  const calls=[];
  const stripe={healthwiseVerifiedTestMode:true,healthwiseVerifiedAccountId:account,checkout:{sessions:{
    retrieve:async id=>{calls.push(["retrieve",id]);return s;},
    listLineItems:async id=>{calls.push(["list",id]);return items;}
  }}};
  return {stripe,calls};
}
const args=(stripe,changes={})=>({stripe,stripeAccountId:account,expectedAccountId:account,sessionId,orderId,userId:"user_abc",tier:"quick",priceId,amountCents:4900,...changes});
test("authenticated read-only lookup verifies exact orphan session and one line item",async()=>{
  const {stripe,calls}=client();
  const r=await verifyOrphanSandboxSession(args(stripe));
  assert.deepEqual(r,{sessionId,orderId,priceId,status:"open",verified:true});
  assert.ok(Object.isFrozen(r));
  assert.deepEqual(calls,[["retrieve",sessionId],["list",sessionId]]);
});
test("rejects unverified account before any provider lookup",async()=>{
  const {stripe,calls}=client();
  for(const change of [{expectedAccountId:"acct_other"},{stripeAccountId:"acct_other"},{sessionId:"cs_live_abc"}]){
    await assert.rejects(verifyOrphanSandboxSession(args(stripe,change)),/(unverified_stripe_account|invalid_test_session)/);
  }
  stripe.healthwiseVerifiedAccountId="acct_other";
  await assert.rejects(verifyOrphanSandboxSession(args(stripe)),/unverified_stripe_account/);
  assert.equal(calls.length,0);
});
test("rejects inaccurate session context without inspecting line items",async()=>{
  for(const edit of [{livemode:true},{id:"cs_test_other"},{amount_total:99},{client_reference_id:"other"},{metadata:{orderId:"other",consultationKey:"quick"}},{status:"unknown"},{mode:"subscription"}]){
    const {stripe,calls}=client({s:{...session,...edit}});
    await assert.rejects(verifyOrphanSandboxSession(args(stripe)),/orphan_session_mismatch/);
    assert.deepEqual(calls,[["retrieve",sessionId]]);
  }
});
test("rejects mismatched, extra and paginated line items",async()=>{
  for(const items of [
    {...lineItems,has_more:true},
    {...lineItems,data:[]},
    {...lineItems,data:[...lineItems.data,...lineItems.data]},
    {...lineItems,data:[{...lineItems.data[0],price:{id:"price_legacy"}}]},
    {...lineItems,data:[{...lineItems.data[0],amount_total:999}]}
  ]) {
    const {stripe}=client({items});
    await assert.rejects(verifyOrphanSandboxSession(args(stripe)),/orphan_line_items_mismatch/);
  }
});
