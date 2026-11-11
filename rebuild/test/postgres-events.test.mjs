import test from "node:test";
import assert from "node:assert/strict";
import { createEventRepository } from "../src/integrations/postgres-events.mjs";
function harness({ failOn } = {}) {
  const calls=[]; let released=0;
  const client={
    query:async (sql,values=[])=>{
      calls.push({sql,values});
      if (failOn && sql.includes(failOn)) throw new Error("db_failure");
      if (sql.startsWith("INSERT INTO provider_events")) return {rowCount:1,rows:[{provider_event_id:"evt_abc"}]};
      if (sql.startsWith("SELECT o.id")) return {rowCount:1,rows:[{id:"order_1",account_id:"account_1",provider_subject:"user_1",stripe_session_id:"cs_test_abc",status:"pending",amount_minor:1500,currency:"usd",consultation_key:"quick"}]};
      if (sql.startsWith("UPDATE consultation_orders SET status = 'paid'")) return {rowCount:1,rows:[{id:"order_1",account_id:"account_1"}]};
      return {rowCount:1,rows:[]};
    },
    release:()=>{released++;}
  };
  return {pool:{connect:async()=>client,query:client.query},calls,get released(){return released;}};
}
test("rejects missing pool",()=>assert.throws(()=>createEventRepository(),/pool_required/));
test("commits successful transaction and releases client",async()=>{
  const h=harness();
  await createEventRepository(h.pool).transaction(async tx=>{
    assert.equal(await tx.recordEventOnce({eventId:"evt_abc",type:"checkout.session.completed"}),true);
    const order=await tx.lockOrderBySession("cs_test_abc");
    assert.equal(order.userId,"user_1");
    await tx.applyDecision({action:"mark_paid",eventId:"evt_abc",orderId:order.id});
  });
  assert.equal(h.calls.at(-1).sql,"COMMIT");
  assert.equal(h.released,1);
  assert.ok(h.calls.some(c=>c.sql.startsWith("INSERT INTO booking_entitlements")));
});
test("rolls back and releases on write failure",async()=>{
  const h=harness({failOn:"INSERT INTO booking_entitlements"});
  await assert.rejects(createEventRepository(h.pool).transaction(async tx=>{
    await tx.applyDecision({action:"mark_paid",eventId:"evt_abc",orderId:"order_1"});
  }),/db_failure/);
  assert.equal(h.calls.at(-1).sql,"ROLLBACK");
  assert.equal(h.released,1);
});
test("unknown decisions fail closed",async()=>{
  const h=harness();
  await assert.rejects(createEventRepository(h.pool).transaction(tx=>tx.applyDecision({action:"grant",eventId:"evt_abc"})),/invalid_decision/);
  assert.equal(h.calls.at(-1).sql,"ROLLBACK");
});
test("SQL uses parameterized session lookup",async()=>{
  const h=harness();
  await createEventRepository(h.pool).transaction(tx=>tx.lockOrderBySession("cs_test_abc"));
  const q=h.calls.find(c=>c.sql.startsWith("SELECT o.id"));
  assert.ok(q.sql.includes("$1"));
  assert.deepEqual(q.values,["cs_test_abc"]);
});

test("nonlocking order snapshot uses parameterized SQL",async()=>{
  const h=harness();
  const order=await createEventRepository(h.pool).findOrderBySession("cs_test_abc");
  assert.equal(order.configuredPriceId,undefined);
  assert.equal(order.userId,"user_1");
  const q=h.calls.find(c=>c.sql.startsWith("SELECT o.id")&&!c.sql.includes("FOR UPDATE"));
  assert.ok(q.sql.includes("$1"));
  assert.deepEqual(q.values,["cs_test_abc"]);
  assert.equal(h.calls.some(c=>c.sql==="BEGIN"),false);
});
test("nonlocking snapshot rejects non-test session IDs",async()=>{
  const h=harness();
  await assert.rejects(createEventRepository(h.pool).findOrderBySession("cs_live_abc"),/invalid_test_session/);
  assert.equal(h.calls.length,0);
});
