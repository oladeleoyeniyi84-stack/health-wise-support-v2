/**
 * Isolated PostgreSQL invariants: order owner and auth subject are immutable.
 * Applies design-only migrations in a disposable per-run schema, never prod.
 */
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
const schema="hw_immutable_owner_"+process.pid;
const admin=new Pool({connectionString:url,max:2,connectionTimeoutMillis:3000});
const pool=new Pool({connectionString:url,max:5,connectionTimeoutMillis:3000,options:"-c search_path="+schema});
const account1="11111111-1111-4111-8111-111111111111";
const account2="22222222-2222-4222-8222-222222222222";
const order1="33333333-3333-4333-8333-333333333333";
const order2="44444444-4444-4444-8444-444444444444";
const price=HEALTHWISE_V2_SANDBOX_CATALOG.quick;
const reserve=id=>reserveOwnerBoundV2SandboxAttempt({
  pool,orderId:id,priceId:price.priceId,amountCents:4900,currency:"usd",
  tier:"quick",idempotencyKey:"hw_immutable_owner_"+id.replaceAll("-",""),
  expectedOwnerSubject:"synthetic_owner_1"
});
const owner=async(id)=>{
  const r=await pool.query("SELECT account_id FROM consultation_orders WHERE id=$1",[id]);
  return String(r.rows[0].account_id);
};
let created=false,blocker=null;
try{
  const setup=await admin.connect();
  try{
    await setup.query('CREATE SCHEMA "'+schema+'"');
    created=true;
    await setup.query('SET search_path TO "'+schema+'",public');
    for(const file of ["001_foundation.sql","002_sandbox_checkout_attempts.sql","003_immutable_order_ownership.sql"]){
      const ddl=await readFile(new URL("../db/"+file,import.meta.url),"utf8");
      await setup.query(ddl.replace(/^BEGIN;\s*/m,"").replace(/\s*COMMIT;\s*$/m,""));
    }
    await setup.query("INSERT INTO accounts(id,provider_subject) VALUES($1,'synthetic_owner_1'),($2,'synthetic_owner_2')",[account1,account2]);
    for(const id of [order1,order2])
      await setup.query("INSERT INTO consultation_orders(id,account_id,consultation_key,configured_price_id,currency,amount_minor) VALUES($1,$2,'quick',$3,'usd',4900)",[id,account1,price.priceId]);
  }finally{setup.release();}

  // The baseline owned order can still reserve/retry, and benign account
  // updates are permitted. The rule blocks only identity-changing updates.
  assert.equal((await reserve(order1)).state,"prepared");
  assert.equal((await reserve(order1)).state,"prepared");
  await pool.query("UPDATE consultation_orders SET account_id=account_id WHERE id=$1",[order1]);
  await pool.query("UPDATE accounts SET provider_subject=provider_subject WHERE id=$1",[account1]);

  // Attempted reassignment after successful reservation must be rejected.
  for(const id of [order1,order2]){
    await assert.rejects(
      pool.query("UPDATE consultation_orders SET account_id=$2 WHERE id=$1",[id,account2]),
      /consultation_order_owner_immutable/
    );
    assert.equal(await owner(id),account1);
  }
  // Prevent moving identity to another account by changing the auth subject.
  await assert.rejects(
    pool.query("UPDATE accounts SET provider_subject=$2 WHERE id=$1",[account1,"synthetic_owner_other"]),
    /account_subject_immutable/
  );

  // Concurrent transaction holds order lock; once reservation commits,
  // competing owner reassignments must still be rejected by the trigger.
  blocker=await pool.connect();
  await blocker.query("BEGIN");
  await blocker.query("SELECT id FROM consultation_orders WHERE id=$1 FOR UPDATE",[order2]);
  const mutation=pool.query("UPDATE consultation_orders SET account_id=$2 WHERE id=$1",[order2,account2]);
  await blocker.query("COMMIT");
  blocker.release();blocker=null;
  await assert.rejects(mutation,/consultation_order_owner_immutable/);
  assert.equal(await owner(order2),account1);
  assert.equal((await reserve(order2)).state,"prepared");
  const count=await pool.query(
    "SELECT count(*)::int AS n FROM sandbox_checkout_attempts WHERE order_id=$1",[order2]
  );
  assert.equal(count.rows[0].n,1);
  console.log("PASS: isolated PostgreSQL prevents order-owner reassignment and auth-subject substitution before and after Checkout reservation");
}finally{
  if(blocker){await blocker.query("ROLLBACK").catch(()=>{});blocker.release();}
  await pool.end();
  if(created){
    const cleanup=await admin.connect();
    try{await cleanup.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');}
    finally{cleanup.release();}
  }
  await admin.end();
}
