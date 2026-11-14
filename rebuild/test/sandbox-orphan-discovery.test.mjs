import test from "node:test";
import assert from "node:assert/strict";
import { discoverOrphanV2SandboxSession } from "../src/integrations/sandbox-orphan-discovery.mjs";
import { HEALTHWISE_V2_SANDBOX_ACCOUNT as account } from "../src/integrations/stripe-v2-catalog.mjs";

const orderId="123e4567-e89b-42d3-a456-426614174000";
const priceId="price_1UbQvoDSAM5aSpF4YcfIcscG";
const now=new Date("2026-11-13T18:00:00Z");
const row={id:orderId,status:"pending",configured_price_id:priceId,amount_minor:"4900",
  currency:"usd",consultation_key:"quick",order_session_id:null,
  idempotency_key:"healthwise_attempt_12345678",state:"prepared",
  attempt_price_id:priceId,attempt_session_id:null,
  created_at:"2026-11-13T17:50:00Z",provider_subject:"user_abc"};
const sessionId="cs_test_RecoveryFound";
const candidate={id:sessionId,livemode:false,mode:"payment",client_reference_id:"user_abc",
  metadata:{orderId,consultationKey:"quick"}};
function fixture({stored=row,pages=[{has_more:false,data:[candidate]}],accountId=account,
  livemode=false,sessionStatus="open",linePrice=priceId}={}){
  let i=0;
  const calls=[];
  const stripe={accounts:{retrieve:async()=>{calls.push("account");return {object:"account",id:accountId};}},
    balance:{retrieve:async()=>{calls.push("balance");return {object:"balance",livemode};}},
    checkout:{sessions:{
      list:async params=>{calls.push(["list",params]);return pages[i++];},
      retrieve:async id=>{calls.push(["retrieve",id]);return {id,livemode:false,mode:"payment",
        status:sessionStatus,client_reference_id:"user_abc",
        metadata:{orderId,consultationKey:"quick"},amount_total:4900,currency:"usd"};},
      listLineItems:async id=>{calls.push(["items",id]);return {has_more:false,
        data:[{quantity:1,amount_total:4900,price:{id:linePrice}}]};}
    }}
  };
  const pool={query:async()=>{calls.push("db");return {rowCount:stored?1:0,rows:stored?[stored]:[]};}};
  return {stripe,pool,calls};
}
const run=(f,extra={})=>discoverOrphanV2SandboxSession({stripe:f.stripe,pool:f.pool,orderId,now,...extra});
test("finds one verified session by scanning a bounded read-only Stripe listing",async()=>{
  const f=fixture();
  assert.deepEqual(await run(f),{action:"candidate_verified",orderId,sessionId,status:"open"});
  const list=f.calls.find(x=>Array.isArray(x)&&x[0]==="list");
  assert.equal(list[1].limit,100);
  assert.deepEqual(list[1].created,{gte:Math.floor(Date.parse(row.created_at)/1000)-300,lte:Math.floor(now.getTime()/1000)});
  assert.equal(f.calls.filter(x=>Array.isArray(x)&&x[0]==="retrieve").length,1);
});
test("paginates before treating one candidate as exhaustive",async()=>{
  const f=fixture({pages:[
    {has_more:true,data:[{id:"cs_test_first",livemode:false,mode:"payment",metadata:{orderId:"different"}}]},
    {has_more:false,data:[candidate]}
  ]});
  assert.equal((await run(f)).action,"candidate_verified");
  const lists=f.calls.filter(x=>Array.isArray(x)&&x[0]==="list");
  assert.equal(lists.length,2);
  assert.equal(lists[1][1].starting_after,"cs_test_first");
});
test("never declares a unique candidate when listing is truncated",async()=>{
  const f=fixture({pages:[{has_more:true,data:[candidate]}]});
  const out=await run(f,{maxPages:1});
  assert.deepEqual(out,{action:"manual_review",reason:"incomplete_stripe_listing",orderId});
  assert.ok(!f.calls.includes("connect"));
  assert.equal(f.calls.filter(x=>Array.isArray(x)&&x[0]==="retrieve").length,0);
});
test("multiple sessions and zero sessions require manual review",async()=>{
  const multi=fixture({pages:[{has_more:false,data:[
    candidate,{...candidate,id:"cs_test_AnotherSession"}
  ]}]});
  assert.deepEqual(await run(multi),{action:"manual_review",reason:"multiple_matching_sessions",orderId});
  const none=fixture({pages:[{has_more:false,data:[]}]});
  assert.deepEqual(await run(none),{action:"manual_review",reason:"no_unique_session_found",orderId});
});
test("wrong account or live mode prevents any Stripe session listing",async()=>{
  for(const options of [{accountId:"acct_other"},{livemode:true}]){
    const f=fixture(options);
    await assert.rejects(run(f),/(stripe_sandbox_account_mismatch|stripe_test_mode_required)/);
    assert.equal(f.calls.filter(x=>Array.isArray(x)&&x[0]==="list").length,0);
  }
});
test("wrong expected price and stale attempts prevent any Stripe API calls",async()=>{
  for(const stored of [{...row,configured_price_id:"price_legacy"},
    {...row,order_session_id:"cs_test_existing"}]){
    const f=fixture({stored});
    await assert.rejects(run(f),/discovery_order_mismatch/);
    assert.deepEqual(f.calls,["db"]);
  }
  const stale=fixture({stored:{...row,created_at:"2026-11-12T00:00:00Z"}});
  assert.deepEqual(await run(stale),{action:"manual_review",reason:"attempt_outside_safe_search_window",orderId});
  assert.deepEqual(stale.calls,["db"]);
});
test("verified matching metadata with wrong line item is rejected",async()=>{
  const f=fixture({linePrice:"price_wrong"});
  await assert.rejects(run(f),/orphan_line_items_mismatch/);
});
test("invalid listing, invalid clock and absent order fail closed",async()=>{
  const malformed=fixture({pages:[{has_more:true,data:[]}]});
  await assert.rejects(run(malformed),/invalid_stripe_pagination/);
  const missing=fixture({stored:null});
  await assert.rejects(run(missing),/discovery_order_missing/);
  const f=fixture();
  await assert.rejects(run(f,{maxPages:6}),/invalid_discovery_limits/);
  assert.equal(f.calls.length,0);
});
