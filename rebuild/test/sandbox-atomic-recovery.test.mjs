import test from "node:test";
import assert from "node:assert/strict";
import { bindRecoveredSandboxSession } from "../src/integrations/sandbox-atomic-recovery.mjs";

const orderId="123e4567-e89b-42d3-a456-426614174000";
const sessionId="cs_test_abc123";
const priceId="price_Abc123";
const idempotencyKey="healthwise_checkout_attempt_123456";
const params={orderId,sessionId,priceId,idempotencyKey};
const prepared={
  id:orderId,status:"pending",configured_price_id:priceId,
  order_session_id:null,state:"prepared",attempt_price_id:priceId,
  idempotency_key:idempotencyKey,attempt_session_id:null
};
function fixture(row=prepared, failOn=null) {
  const calls=[];
  let released=false;
  const client={
    query:async(sql,values)=>{
      calls.push({sql,values});
      if(failOn && sql.includes(failOn)) throw Error("simulated_database_failure");
      if(sql.includes("SELECT o.id")) return {rowCount:row?1:0,rows:row?[row]:[]};
      if(sql.includes("UPDATE ")) return {rowCount:1,rows:[{}]};
      return {rowCount:0,rows:[]};
    },
    release:()=>{released=true;}
  };
  return {pool:{connect:async()=>client},calls,wasReleased:()=>released};
}
test("binds both records inside one transaction with fixed lock order",async()=>{
  const f=fixture();
  assert.deepEqual(await bindRecoveredSandboxSession({pool:f.pool,...params}),{orderId,sessionId,action:"bound"});
  const sql=f.calls.map(x=>x.sql);
  assert.equal(sql[0],"BEGIN");
  assert.match(sql[1],/FOR UPDATE OF o, a/);
  assert.match(sql[2],/UPDATE consultation_orders/);
  assert.match(sql[3],/UPDATE sandbox_checkout_attempts/);
  assert.equal(sql[4],"COMMIT");
  assert.ok(!sql.includes("ROLLBACK"));
  assert.equal(f.wasReleased(),true);
});
test("same session, price, key and pending order are safely idempotent",async()=>{
  const f=fixture({...prepared,state:"bound",order_session_id:sessionId,attempt_session_id:sessionId});
  assert.equal((await bindRecoveredSandboxSession({pool:f.pool,...params})).action,"already_bound");
  assert.equal(f.calls.filter(x=>x.sql.includes("UPDATE ")).length,0);
});
test("inconsistent records, missing rows and changed key fail closed",async()=>{
  for(const row of [
    null,
    {...prepared,status:"paid"},
    {...prepared,idempotency_key:"different_key_123456"},
    {...prepared,configured_price_id:"price_Other"},
    {...prepared,state:"manual_review"},
    {...prepared,order_session_id:"cs_test_else"},
    {...prepared,state:"bound",attempt_session_id:sessionId}
  ]){
    const f=fixture(row);
    await assert.rejects(bindRecoveredSandboxSession({pool:f.pool,...params}),/recovery_binding_conflict/);
    assert.ok(f.calls.some(x=>x.sql==="ROLLBACK"));
    assert.ok(f.wasReleased());
    assert.equal(f.calls.filter(x=>x.sql.includes("UPDATE ")).length,0);
  }
});
test("second UPDATE failure rolls back both records",async()=>{
  const f=fixture(prepared,"UPDATE sandbox_checkout_attempts");
  await assert.rejects(bindRecoveredSandboxSession({pool:f.pool,...params}),/simulated_database_failure/);
  assert.ok(f.calls.some(x=>x.sql==="ROLLBACK"));
  assert.ok(!f.calls.some(x=>x.sql==="COMMIT"));
  assert.ok(f.wasReleased());
});
test("invalid input makes no database call",async()=>{
  let calls=0;const pool={connect:async()=>{calls++;throw Error("unexpected");}};
  for(const change of [{sessionId:"cs_live_wrong"},{orderId:"bad"},{priceId:"legacy"},{idempotencyKey:"short"}]){
    await assert.rejects(bindRecoveredSandboxSession({pool,...params,...change}),/invalid_/);
  }
  assert.equal(calls,0);
});
