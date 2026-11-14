import test from "node:test";
import assert from "node:assert/strict";
import { recoverDiscoveredV2SandboxSession } from "../src/integrations/sandbox-discovered-session-recovery.mjs";
import { HEALTHWISE_V2_SANDBOX_ACCOUNT as account } from "../src/integrations/stripe-v2-catalog.mjs";

const orderId = "123e4567-e89b-42d3-a456-426614174000";
const sessionId = "cs_test_Discovered123";
const priceId = "price_1UbQvoDSAM5aSpF4YcfIcscG";
const key = "healthwise_orphan_attempt_123456";
const now = new Date("2026-11-13T18:00:00Z");
const row = {
  id: orderId, status: "pending", configured_price_id: priceId,
  amount_minor: "4900", currency: "usd", consultation_key: "quick",
  order_session_id: null, attempt_session_id: null, state: "prepared",
  attempt_price_id: priceId, idempotency_key: key,
  created_at: "2026-11-13T17:55:00Z", provider_subject: "user_abc"
};
const listing = {id:sessionId, livemode:false, mode:"payment", client_reference_id:"user_abc", metadata:{orderId,consultationKey:"quick"}};
const full = {...listing,status:"open",amount_total:4900,currency:"usd"};
function setup({pages=[{has_more:false,data:[listing]}],wrongAccount=false,failJournal=false,wrongOnSecondRetrieve=false,stored=row}={}) {
  const calls=[];
  let listIndex=0;
  let retrieved=0;
  const stripe = {
    accounts:{retrieve:async()=>{calls.push("account");return {object:"account",id:wrongAccount?"acct_other":account};}},
    balance:{retrieve:async()=>{calls.push("balance");return {object:"balance",livemode:false};}},
    checkout:{sessions:{
      list:async()=>{calls.push("list");return pages[listIndex++];},
      retrieve:async()=>{calls.push("retrieve");retrieved++;return wrongOnSecondRetrieve&&retrieved===2?{...full,amount_total:9900}:full;},
      listLineItems:async()=>{calls.push("items");return {has_more:false,data:[{quantity:1,amount_total:4900,price:{id:priceId}}]};}
    }}
  };
  const client={
    query:async(sql)=>{
      if(sql==="BEGIN"||sql==="COMMIT"||sql==="ROLLBACK"){calls.push(sql);return {rowCount:0,rows:[]};}
      if(sql.includes("FOR UPDATE OF o, a")) {
        calls.push("lock");
        return {rowCount:1,rows:[{id:orderId,status:"pending",configured_price_id:priceId,
          order_session_id:null,state:"prepared",attempt_price_id:priceId,
          idempotency_key:key,attempt_session_id:null}]};
      }
      if(sql.includes("UPDATE consultation_orders")){calls.push("updateOrder");return {rowCount:1,rows:[{}]};}
      if(sql.includes("UPDATE sandbox_checkout_attempts")){
        calls.push("updateJournal");
        if(failJournal)throw new Error("journal_failure");
        return {rowCount:1,rows:[{}]};
      }
      throw Error("unexpected transaction SQL");
    },
    release:()=>calls.push("release")
  };
  const pool={
    query:async()=>{calls.push("db");return {rowCount:stored?1:0,rows:stored?[stored]:[]};},
    connect:async()=>{calls.push("connect");return client;}
  };
  return {stripe,pool,calls};
}
const run=f=>recoverDiscoveredV2SandboxSession({stripe:f.stripe,pool:f.pool,orderId,now});
test("uniquely discovered session is reverified before atomic binding",async()=>{
  const f=setup();
  assert.deepEqual(await run(f),{orderId,sessionId,action:"bound"});
  assert.equal(f.calls.filter(x=>x==="retrieve").length,2);
  assert.equal(f.calls.filter(x=>x==="account").length,2);
  assert.deepEqual(f.calls.slice(-7),["connect","BEGIN","lock","updateOrder","updateJournal","COMMIT","release"]);
});
test("zero or multiple matches never bind or create Checkout",async()=>{
  for(const pages of [
    [{has_more:false,data:[]}],
    [{has_more:false,data:[listing,{...listing,id:"cs_test_Other"}]}],
    [{has_more:true,data:[listing]}]
  ]){
    const f=setup({pages});
    const result=await recoverDiscoveredV2SandboxSession({stripe:f.stripe,pool:f.pool,orderId,now,maxPages:1});
    assert.equal(result.action,"manual_review");
    assert.ok(!f.calls.includes("connect"));
    assert.ok(!f.calls.includes("updateOrder"));
  }
});
test("wrong sandbox account blocks provider session lookup and all writes",async()=>{
  const f=setup({wrongAccount:true});
  await assert.rejects(run(f),/stripe_sandbox_account_mismatch/);
  assert.ok(!f.calls.includes("connect"));
});
test("changed provider response on independent second read prevents binding",async()=>{
  const f=setup({wrongOnSecondRetrieve:true});
  await assert.rejects(run(f),/orphan_session_mismatch/);
  assert.equal(f.calls.filter(x=>x==="retrieve").length,2);
  assert.ok(!f.calls.includes("connect"));
});
test("database journal failure triggers rollback of both records",async()=>{
  const f=setup({failJournal:true});
  await assert.rejects(run(f),/journal_failure/);
  assert.ok(f.calls.includes("ROLLBACK"));
  assert.ok(!f.calls.includes("COMMIT"));
});
test("stale attempt and missing order do not query Stripe",async()=>{
  const stale=setup({stored:{...row,created_at:"2026-11-11T00:00:00Z"}});
  assert.equal((await run(stale)).action,"manual_review");
  assert.deepEqual(stale.calls,["db"]);
  const missing=setup({stored:null});
  await assert.rejects(run(missing),/discovery_order_missing/);
  assert.deepEqual(missing.calls,["db"]);
});
