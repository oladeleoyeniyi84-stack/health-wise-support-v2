import test from "node:test";
import assert from "node:assert/strict";
import { inspectSandboxCheckoutRecovery } from "../src/integrations/sandbox-checkout-recovery.mjs";
const orderId="123e4567-e89b-42d3-a456-426614174000";
const now=new Date("2026-11-13T18:00:00.000Z");
const base={
  order_id:orderId,
  state:"prepared",
  stripe_session_id:null,
  created_at:"2026-11-13T17:59:00.000Z",
  order_status:"pending",
  order_session_id:null
};
function fixture(row=base) {
  const calls=[];
  const pool={query:async(sql,params)=>{calls.push({sql,params});return {rowCount:row?1:0,rows:row?[row]:[]};}};
  return {pool,calls};
}
test("fresh unknown provider outcome requires lookup but cannot auto-create Checkout",async()=>{
  const {pool,calls}=fixture();
  assert.deepEqual(await inspectSandboxCheckoutRecovery({pool,orderId,now}),{
    orderId,action:"provider_lookup_required",reason:"ambiguous_provider_outcome"
  });
  assert.equal(calls.length,1);
  assert.match(calls[0].sql,/^SELECT /);
  assert.deepEqual(calls[0].params,[orderId]);
});
test("older unresolved attempt needs manual review, not a fresh key or retry",async()=>{
  const {pool}=fixture({...base,created_at:"2026-11-13T17:40:00.000Z"});
  assert.equal((await inspectSandboxCheckoutRecovery({pool,orderId,now})).action,"manual_review");
});
test("only identical bound sessions with pending order are classified bound",async()=>{
  const row={...base,state:"bound",stripe_session_id:"cs_test_abc123",order_session_id:"cs_test_abc123"};
  assert.deepEqual(await inspectSandboxCheckoutRecovery({pool:fixture(row).pool,orderId,now}),{
    orderId,action:"bound",reason:"matching_persisted_sessions"
  });
  for(const invalid of [
    {...row,order_session_id:"cs_test_other"},
    {...row,order_status:"paid"},
    {...row,stripe_session_id:"cs_live_bad"},
    {...base,state:"manual_review"},
    {...base,order_session_id:"cs_test_unknown"}
  ]) assert.equal((await inspectSandboxCheckoutRecovery({pool:fixture(invalid).pool,orderId,now})).action,"manual_review");
});
test("invalid or future timestamps, missing attempts and invalid inputs fail closed",async()=>{
  for(const created_at of ["invalid","2026-11-14T00:00:00Z"]){
    const result=await inspectSandboxCheckoutRecovery({pool:fixture({...base,created_at}).pool,orderId,now});
    assert.deepEqual(result,{orderId,action:"manual_review",reason:"invalid_attempt_time"});
  }
  await assert.rejects(inspectSandboxCheckoutRecovery({pool:fixture(null).pool,orderId,now}),/attempt_not_found_or_ambiguous/);
  let calls=0;const pool={query:async()=>{calls++;throw Error("unexpected_db_call");}};
  await assert.rejects(inspectSandboxCheckoutRecovery({pool,orderId:"bad",now}),/invalid_order_id/);
  await assert.rejects(inspectSandboxCheckoutRecovery({pool,orderId,now:new Date("bad")}),/invalid_recovery_clock/);
  assert.equal(calls,0);
});
