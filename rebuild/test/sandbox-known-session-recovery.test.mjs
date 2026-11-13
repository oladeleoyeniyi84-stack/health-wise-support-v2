import test from "node:test";
import assert from "node:assert/strict";
import { recoverKnownV2SandboxSession } from "../src/integrations/sandbox-known-session-recovery.mjs";
import { HEALTHWISE_V2_SANDBOX_ACCOUNT as account } from "../src/integrations/stripe-v2-catalog.mjs";

const orderId="123e4567-e89b-42d3-a456-426614174000";
const sessionId="cs_test_Known123";
const priceId="price_1UbQvoDSAM5aSpF4YcfIcscG";
const key="healthwise_recovery_attempt_123456";
const row={
  id:orderId,status:"pending",configured_price_id:priceId,amount_minor:"4900",
  currency:"usd",consultation_key:"quick",order_session_id:null,
  idempotency_key:key,attempt_price_id:priceId,state:"prepared",
  attempt_session_id:null,provider_subject:"user_abc"
};
const session={
  id:sessionId,livemode:false,mode:"payment",status:"open",
  client_reference_id:"user_abc",
  metadata:{orderId,consultationKey:"quick"},
  amount_total:4900,currency:"usd"
};
function fixture({accountId=account,balanceMode=false,stored=row,providerSession=session,providerItems=null,failJournal=false}={}){
  const calls=[];
  const stripe={
    accounts:{retrieve:async()=>{calls.push("account");return {object:"account",id:accountId};}},
    balance:{retrieve:async()=>{calls.push("balance");return {object:"balance",livemode:balanceMode};}},
    checkout:{sessions:{
      retrieve:async()=>{calls.push("retrieve");return providerSession;},
      listLineItems:async()=>{calls.push("lineItems");return providerItems??{has_more:false,data:[{quantity:1,price:{id:priceId},amount_total:4900}]};}
    }}
  };
  const client={
    query:async(sql)=>{
      if(sql==="BEGIN"||sql==="COMMIT"||sql==="ROLLBACK"){calls.push(sql);return {rowCount:0,rows:[]};}
      if(sql.includes("SELECT o.id")){calls.push("lock");return {rowCount:1,rows:[{
        id:orderId,status:"pending",configured_price_id:priceId,order_session_id:null,
        state:"prepared",attempt_price_id:priceId,idempotency_key:key,attempt_session_id:null
      }]};}
      if(sql.includes("UPDATE consultation_orders")){calls.push("updateOrder");return {rowCount:1,rows:[{}]};}
      if(sql.includes("UPDATE sandbox_checkout_attempts")){
        calls.push("updateJournal");
        if(failJournal) throw new Error("simulated_db_failure");
        return {rowCount:1,rows:[{}]};
      }
      throw Error("unexpected transaction SQL");
    },release:()=>{calls.push("release");}
  };
  const pool={
    query:async()=>{calls.push("orderRead");return {rowCount:stored?1:0,rows:stored?[stored]:[]};},
    connect:async()=>{calls.push("connect");return client;}
  };
  return {stripe,pool,calls};
}
test("known open test session verifies account, exact line item and binds atomically",async()=>{
  const f=fixture();
  const result=await recoverKnownV2SandboxSession({...f,orderId,sessionId});
  assert.deepEqual(result,{orderId,sessionId,action:"bound"});
  assert.deepEqual(f.calls,["orderRead","account","balance","retrieve","lineItems","connect","BEGIN","lock","updateOrder","updateJournal","COMMIT","release"]);
});
test("account mismatch fails before session lookup or database write",async()=>{
  const f=fixture({accountId:"acct_other"});
  await assert.rejects(recoverKnownV2SandboxSession({...f,orderId,sessionId}),/stripe_sandbox_account_mismatch/);
  assert.deepEqual(f.calls,["orderRead","account"]);
});
test("live-mode balance and wrong price fail closed without binding",async()=>{
  const live=fixture({balanceMode:true});
  await assert.rejects(recoverKnownV2SandboxSession({...live,orderId,sessionId}),/stripe_test_mode_required/);
  assert.ok(!live.calls.includes("connect"));
  const mismatch=fixture({stored:{...row,configured_price_id:"price_Legacy"}});
  await assert.rejects(recoverKnownV2SandboxSession({...mismatch,orderId,sessionId}),/recovery_order_mismatch/);
  assert.deepEqual(mismatch.calls,["orderRead"]);
});
test("provider line item mismatch and completed session never bind",async()=>{
  const bad=fixture({providerItems:{has_more:false,data:[{quantity:1,amount_total:4900,price:{id:"price_legacy"}}]}});
  await assert.rejects(recoverKnownV2SandboxSession({...bad,orderId,sessionId}),/orphan_line_items_mismatch/);
  assert.ok(!bad.calls.includes("connect"));
  const completed=fixture({providerSession:{...session,status:"complete"}});
  assert.deepEqual(await recoverKnownV2SandboxSession({...completed,orderId,sessionId}),{orderId,action:"manual_review",reason:"session_not_open"});
  assert.ok(!completed.calls.includes("connect"));
});
test("journal failure rolls back transaction after provider verification",async()=>{
  const f=fixture({failJournal:true});
  await assert.rejects(recoverKnownV2SandboxSession({...f,orderId,sessionId}),/simulated_db_failure/);
  assert.ok(f.calls.includes("ROLLBACK"));
  assert.ok(!f.calls.includes("COMMIT"));
  assert.ok(f.calls.includes("release"));
});
test("unknown session ID and missing order fail before Stripe activity",async()=>{
  const f=fixture();
  await assert.rejects(recoverKnownV2SandboxSession({...f,orderId,sessionId:"cs_live_wrong"}),/invalid_test_session/);
  assert.equal(f.calls.length,0);
  const missing=fixture({stored:null});
  await assert.rejects(recoverKnownV2SandboxSession({...missing,orderId,sessionId}),/recovery_order_not_found/);
  assert.deepEqual(missing.calls,["orderRead"]);
});
