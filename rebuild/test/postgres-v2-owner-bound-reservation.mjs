/** Disposable PostgreSQL owner-TOCTOU gate; NO Stripe requests or live data. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { assertDisposableDatabase } from "./support/disposable-db-guard.mjs";
import { reserveOwnerBoundV2SandboxAttempt } from "../src/integrations/stripe-v2-owner-bound-reservation.mjs";
import { HEALTHWISE_V2_SANDBOX_CATALOG } from "../src/integrations/stripe-v2-catalog.mjs";

const url=assertDisposableDatabase({
  url:process.env.HEALTHWISE_TEST_DATABASE_URL,
  ack:process.env.HEALTHWISE_ISOLATED_DB_ACK
});
const schema="hw_owner_gate_"+process.pid;
const admin=new Pool({connectionString:url,max:2,connectionTimeoutMillis:3000});
const owner1="11111111-1111-4111-8111-111111111111";
const owner2="22222222-2222-4222-8222-222222222222";
const order1="33333333-3333-4333-8333-333333333333";
const order2="44444444-4444-4444-8444-444444444444";
const price=HEALTHWISE_V2_SANDBOX_CATALOG.quick;
const args=(pool,orderId,key)=>({
  pool,orderId,priceId:price.priceId,amountCents:4900,currency:"usd",
  tier:"quick",idempotencyKey:key,expectedOwnerSubject:"member_original"
});
let pool,created=false,blocking;
try{
  const setup=await admin.connect();
  try{
    await setup.query('CREATE SCHEMA "'+schema+'"');
    created=true;
    await setup.query('SET search_path TO "'+schema+'",public');
    for(const file of ["001_foundation.sql","002_sandbox_checkout_attempts.sql"]){
      const ddl=await readFile(new URL("../db/"+file,import.meta.url),"utf8");
      await setup.query(ddl.replace(/^BEGIN;\s*/m,"").replace(/\s*COMMIT;\s*$/m,""));
    }
    await setup.query("INSERT INTO accounts(id,provider_subject) VALUES ($1,'member_original'),($2,'member_reassigned')",[owner1,owner2]);
    for(const id of [order1,order2]){
      await setup.query(
        "INSERT INTO consultation_orders(id,account_id,consultation_key,configured_price_id,currency,amount_minor) VALUES($1,$2,'quick',$3,'usd',4900)",
        [id,owner1,price.priceId]
      );
    }
  }finally{setup.release();}
  pool=new Pool({connectionString:url,max:5,connectionTimeoutMillis:3000,options:"-c search_path="+schema});
  const key1="hw_owner_gate_order_one_key_123456";
  assert.equal((await reserveOwnerBoundV2SandboxAttempt(args(pool,order1,key1))).state,"prepared");
  assert.equal((await reserveOwnerBoundV2SandboxAttempt(args(pool,order1,key1))).idempotencyKey,key1);
  await assert.rejects(reserveOwnerBoundV2SandboxAttempt(args(pool,order1,"hw_owner_gate_other_key_123456")),/checkout_attempt_conflict/);

  // Simulated reassignment after authentication but before the locked write.
  await pool.query("UPDATE consultation_orders SET account_id=$2 WHERE id=$1",[order2,owner2]);
  await assert.rejects(reserveOwnerBoundV2SandboxAttempt(args(pool,order2,"hw_owner_gate_second_key_123456")),/checkout_owner_mismatch/);
  const none=await pool.query("SELECT count(*)::int AS n FROM sandbox_checkout_attempts WHERE order_id=$1",[order2]);
  assert.equal(none.rows[0].n,0);

  // Block a competing owner change under a separate transaction to prove
  // owner-bound reservation observes the final committed owner, not stale data.
  await pool.query("UPDATE consultation_orders SET account_id=$2 WHERE id=$1",[order2,owner1]);
  blocking=await pool.connect();
  await blocking.query("BEGIN");
  await blocking.query("UPDATE consultation_orders SET account_id=$2 WHERE id=$1",[order2,owner2]);
  const waiting=reserveOwnerBoundV2SandboxAttempt(args(pool,order2,"hw_owner_gate_race_key_123456"));
  await blocking.query("COMMIT");
  blocking.release();blocking=null;
  await assert.rejects(waiting,/checkout_owner_mismatch/);
  const final=await pool.query("SELECT count(*)::int AS n FROM sandbox_checkout_attempts WHERE order_id=$1",[order2]);
  assert.equal(final.rows[0].n,0);
  console.log("PASS: owner-bound PostgreSQL reservation rejects reassignment and commits no journal entry for wrong owner");
}finally{
  if(blocking){await blocking.query("ROLLBACK").catch(()=>{});blocking.release();}
  if(pool)await pool.end();
  if(created){
    const cleanup=await admin.connect();
    try{await cleanup.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');}
    finally{cleanup.release();}
  }
  await admin.end();
}
