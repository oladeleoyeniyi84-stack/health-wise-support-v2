/**
 * Disposable PostgreSQL concurrency test using two independent connections.
 * NEVER run against production. Dedicated CI-only database required.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const url = process.env.HEALTHWISE_TEST_DATABASE_URL;
if (process.env.HEALTHWISE_ISOLATED_DB_ACK !== "YES_DISPOSABLE_DB" || !url) throw new Error("disposable_database_explicit_ack_required");
const parsed = new URL(url);
if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) throw new Error("local_database_only");
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
