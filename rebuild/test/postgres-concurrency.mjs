/**
 * Disposable PostgreSQL concurrency test using two independent connections.
 * NEVER run against production. Dedicated CI-only database required.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { assertDisposableDatabase } from "./support/disposable-db-guard.mjs";
import { createEventRepository } from "../src/integrations/postgres-events.mjs";
import { reconcileSandboxPayment } from "../src/integrations/payment-reconciliation.mjs";

const url = assertDisposableDatabase({url:process.env.HEALTHWISE_TEST_DATABASE_URL,ack:process.env.HEALTHWISE_ISOLATED_DB_ACK});
const pool = new Pool({connectionString:url,max:3,connectionTimeoutMillis:3000});
const schema = "hw_concurrency_" + process.pid;
let first, second;
let schemaCreated = false;
try {
  const migration = await readFile(new URL("../db/001_foundation.sql", import.meta.url),"utf8");
  const ddl = migration.replace(/^BEGIN;\s*/m,"").replace(/\s*COMMIT;\s*$/m,"");
  const setup = await pool.connect();
  try {
    await setup.query('CREATE SCHEMA "' + schema + '"');
    schemaCreated = true;
    await setup.query('SET search_path TO "' + schema + '", public');
    await setup.query(ddl);
    await setup.query("INSERT INTO accounts(id,provider_subject) VALUES($1,$2)",["11111111-1111-4111-8111-111111111111","user_1"]);
    await setup.query("INSERT INTO consultation_orders(id,account_id,consultation_key,configured_price_id,currency,amount_minor,stripe_session_id) VALUES($1,$2,'quick','price_Abc123','usd',1500,'cs_test_concurrent')",["22222222-2222-4222-8222-222222222222","11111111-1111-4111-8111-111111111111"]);
  } finally {setup.release();}
  first=await pool.connect();
  second=await pool.connect();
  for(const client of [first,second]){
    await client.query('SET search_path TO "' + schema + '", public');
    await client.query("SET lock_timeout = '5s'");
  }
  await first.query("BEGIN");
  const lockedFirst=await first.query("SELECT id,account_id,status FROM consultation_orders WHERE stripe_session_id=$1 FOR UPDATE",["cs_test_concurrent"]);
  assert.equal(lockedFirst.rows[0].status,"pending");
  const insertedFirst=await first.query("INSERT INTO provider_events(provider_event_id,event_type,outcome) VALUES('evt_concurrent','checkout.session.completed','received') ON CONFLICT(provider_event_id) DO NOTHING RETURNING provider_event_id");
  assert.equal(insertedFirst.rowCount,1);
  await second.query("BEGIN");
  // Second transaction is blocked on the first transaction's order lock.
  const secondLock=second.query("SELECT id,status FROM consultation_orders WHERE stripe_session_id=$1 FOR UPDATE",["cs_test_concurrent"]);
  const paid=await first.query("UPDATE consultation_orders SET status='paid' WHERE id=$1 AND status='pending' RETURNING account_id",["22222222-2222-4222-8222-222222222222"]);
  assert.equal(paid.rowCount,1);
  await first.query("INSERT INTO booking_entitlements(id,order_id,account_id,state) VALUES(gen_random_uuid(),$1,$2,'pending')",["22222222-2222-4222-8222-222222222222",paid.rows[0].account_id]);
  await first.query("UPDATE provider_events SET outcome='mark_paid',order_id=$1,processed_at=now() WHERE provider_event_id='evt_concurrent'",["22222222-2222-4222-8222-222222222222"]);
  await first.query("COMMIT");
  const lockedSecond=await secondLock;
  assert.equal(lockedSecond.rows[0].status,"paid");
  const insertedSecond=await second.query("INSERT INTO provider_events(provider_event_id,event_type,outcome) VALUES('evt_concurrent','checkout.session.completed','received') ON CONFLICT(provider_event_id) DO NOTHING RETURNING provider_event_id");
  assert.equal(insertedSecond.rowCount,0);
  await second.query("COMMIT");
  const counts=await first.query("SELECT (SELECT count(*)::int FROM provider_events WHERE provider_event_id='evt_concurrent') AS events, (SELECT count(*)::int FROM booking_entitlements WHERE order_id='22222222-2222-4222-8222-222222222222') AS entitlements");
  assert.deepEqual(counts.rows[0],{events:1,entitlements:1});
  console.log("PASS: two PostgreSQL connections serialize duplicate delivery; one event, one entitlement");
  // Exercise the actual repository and reconciliation functions concurrently,
  // rather than only duplicating their SQL manually.
  const order2 = "33333333-3333-4333-8333-333333333333";
  await first.query("INSERT INTO consultation_orders(id,account_id,consultation_key,configured_price_id,currency,amount_minor,stripe_session_id) VALUES($1,$2,'quick','price_Abc123','usd',1500,'cs_test_repository')",[order2,"11111111-1111-4111-8111-111111111111"]);
  // pg's startup options apply to all pooled connections, including snapshots.
  const scopedPool = new Pool({connectionString:url,max:4,connectionTimeoutMillis:3000,options:"-c search_path="+schema});
  try {
    const repository=createEventRepository(scopedPool);
    const event={id:"evt_Repository123",livemode:false,type:"checkout.session.completed",data:{object:{
      id:"cs_test_repository",livemode:false,mode:"payment",payment_status:"paid",
      client_reference_id:"user_1",amount_total:1500,currency:"usd",
      metadata:{orderId:order2,consultationKey:"quick"}
    }}};
    const stripe={checkout:{sessions:{listLineItems:async()=>({
      has_more:false,data:[{quantity:1,amount_total:1500,price:{id:"price_Abc123",active:true,currency:"usd"}}]
    })}}};
    const outcomes=await Promise.all([
      reconcileSandboxPayment({event,stripe,repository}),
      reconcileSandboxPayment({event,stripe,repository})
    ]);
    assert.deepEqual(outcomes.map(x=>x.action).sort(),["duplicate","mark_paid"]);
    const verified=await scopedPool.query("SELECT (SELECT count(*)::int FROM provider_events WHERE provider_event_id='evt_Repository123') AS events, (SELECT count(*)::int FROM booking_entitlements WHERE order_id=$1) AS entitlements, (SELECT status FROM consultation_orders WHERE id=$1) AS status",[order2]);
    assert.deepEqual(verified.rows[0],{events:1,entitlements:1,status:"paid"});
    console.log("PASS: actual repository reconciliation concurrently processes one payment, one duplicate and one entitlement");
    // Two distinct Stripe event IDs may describe the same paid Checkout
    // session. The order must still transition and grant entitlement once.
    const order3="44444444-4444-4444-8444-444444444444";
    await scopedPool.query("INSERT INTO consultation_orders(id,account_id,consultation_key,configured_price_id,currency,amount_minor,stripe_session_id) VALUES($1,$2,'quick','price_Abc123','usd',1500,'cs_test_distinct')",[order3,"11111111-1111-4111-8111-111111111111"]);
    const base={...event,data:{object:{...event.data.object,id:"cs_test_distinct",metadata:{orderId:order3,consultationKey:"quick"}}}};
    const distinct=await Promise.all([
      reconcileSandboxPayment({event:{...base,id:"evt_DistinctA"},stripe,repository}),
      reconcileSandboxPayment({event:{...base,id:"evt_DistinctB"},stripe,repository})
    ]);
    assert.deepEqual(distinct.map(x=>x.action).sort(),["ignore","mark_paid"]);
    const distinctCounts=await scopedPool.query("SELECT (SELECT count(*)::int FROM provider_events WHERE provider_event_id IN ('evt_DistinctA','evt_DistinctB')) AS events, (SELECT count(*)::int FROM booking_entitlements WHERE order_id=$1) AS entitlements, (SELECT status FROM consultation_orders WHERE id=$1) AS status",[order3]);
    assert.deepEqual(distinctCounts.rows[0],{events:2,entitlements:1,status:"paid"});
    console.log("PASS: two distinct event IDs for one session produce one paid transition and one entitlement");

    // Real PostgreSQL rollback: an inserted event and an order transition
    // must both disappear when the transaction fails before commit.
    const rollbackOrder="55555555-5555-4555-8555-555555555555";
    await scopedPool.query("INSERT INTO consultation_orders(id,account_id,consultation_key,configured_price_id,currency,amount_minor,stripe_session_id) VALUES($1,$2,'quick','price_Abc123','usd',1500,'cs_test_rollback')",[rollbackOrder,"11111111-1111-4111-8111-111111111111"]);
    await assert.rejects(repository.transaction(async tx=>{
      assert.equal(await tx.recordEventOnce({eventId:"evt_RollbackReal",type:"checkout.session.completed"}),true);
      await tx.applyDecision({action:"mark_paid",eventId:"evt_RollbackReal",orderId:rollbackOrder});
      throw new Error("simulated_failure_before_commit");
    }),/simulated_failure_before_commit/);
    const rollbackCounts=await scopedPool.query("SELECT (SELECT count(*)::int FROM provider_events WHERE provider_event_id='evt_RollbackReal') AS events, (SELECT count(*)::int FROM booking_entitlements WHERE order_id=$1) AS entitlements, (SELECT status FROM consultation_orders WHERE id=$1) AS status",[rollbackOrder]);
    assert.deepEqual(rollbackCounts.rows[0],{events:0,entitlements:0,status:"pending"});
    console.log("PASS: actual PostgreSQL rollback removes event, paid transition and entitlement together");

    // Redelivery after a rolled-back transaction must safely process the
    // original event ID, then deduplicate the next delivery.
    const recoveredEvent={...event,id:"evt_RollbackReal",data:{object:{
      ...event.data.object,id:"cs_test_rollback",
      metadata:{orderId:rollbackOrder,consultationKey:"quick"}
    }}};
    const recovered=await reconcileSandboxPayment({event:recoveredEvent,stripe,repository});
    assert.equal(recovered.action,"mark_paid");
    const redelivered=await reconcileSandboxPayment({event:recoveredEvent,stripe,repository});
    assert.equal(redelivered.action,"duplicate");
    const recoveredCounts=await scopedPool.query("SELECT (SELECT count(*)::int FROM provider_events WHERE provider_event_id='evt_RollbackReal') AS events, (SELECT count(*)::int FROM booking_entitlements WHERE order_id=$1) AS entitlements, (SELECT status FROM consultation_orders WHERE id=$1) AS status",[rollbackOrder]);
    assert.deepEqual(recoveredCounts.rows[0],{events:1,entitlements:1,status:"paid"});
    console.log("PASS: rolled-back event redelivers once and duplicate delivery grants no extra entitlement");



  } finally {await scopedPool.end();}

} finally {
  for(const client of [first,second]){
    if(client){
      await client.query("ROLLBACK").catch(()=>{});
      client.release();
    }
  }
  if(schemaCreated){
    const cleanup=await pool.connect();
    try {await cleanup.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');}
    finally {cleanup.release();}
  }
  await pool.end();
}
