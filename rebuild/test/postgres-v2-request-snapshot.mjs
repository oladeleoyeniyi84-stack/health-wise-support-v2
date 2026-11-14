/** Disposable PostgreSQL-only immutable Checkout request snapshot proof. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { assertDisposableDatabase } from "./support/disposable-db-guard.mjs";
import {makeV2CheckoutRequestSnapshot,persistV2CheckoutRequestSnapshot} from "../src/integrations/stripe-v2-request-snapshot.mjs";

const url=assertDisposableDatabase({
  url:process.env.HEALTHWISE_TEST_DATABASE_URL,
  ack:process.env.HEALTHWISE_ISOLATED_DB_ACK
});
const schema="hw_snapshot_"+process.pid;
const admin=new Pool({connectionString:url,max:2,connectionTimeoutMillis:3000});
const orderId="33333333-3333-4333-8333-333333333333";
const accountId="11111111-1111-4111-8111-111111111111";
const ownerSubject="synthetic_snapshot_user";
const idempotencyKey="hwv2_immutable_snapshot_fixture_12345";
const snapshot=makeV2CheckoutRequestSnapshot({
 orderId,ownerSubject,tier:"quick",idempotencyKey
});
let created=false,pool;
try{
 const setup=await admin.connect();
 try{
  await setup.query('CREATE SCHEMA "'+schema+'"');
  created=true;
  await setup.query('SET search_path TO "'+schema+'",public');
  for(const filename of ["001_foundation.sql","002_sandbox_checkout_attempts.sql",
                          "003_immutable_order_ownership.sql","004_checkout_request_snapshots.sql"]){
   const sql=await readFile(new URL("../db/"+filename,import.meta.url),"utf8");
   await setup.query(sql.replace(/^BEGIN;\s*/m,"").replace(/\s*COMMIT;\s*$/m,""));
  }
  await setup.query("INSERT INTO accounts(id,provider_subject) VALUES($1,$2)",[accountId,ownerSubject]);
  await setup.query(
   "INSERT INTO consultation_orders(id,account_id,consultation_key,configured_price_id,currency,amount_minor) VALUES($1,$2,'quick',$3,'usd',4900)",
   [orderId,accountId,snapshot.terms.stripePriceId]
  );
  await setup.query(
   "INSERT INTO sandbox_checkout_attempts(order_id,configured_price_id,idempotency_key) VALUES($1,$2,$3)",
   [orderId,snapshot.terms.stripePriceId,idempotencyKey]
  );
 }finally{setup.release();}
 pool=new Pool({connectionString:url,max:4,connectionTimeoutMillis:3000,options:"-c search_path="+schema});
 assert.equal((await persistV2CheckoutRequestSnapshot({pool,snapshot})).action,"snapshot_recorded");
 assert.equal((await persistV2CheckoutRequestSnapshot({pool,snapshot})).action,"snapshot_already_recorded");
 const row=await pool.query("SELECT request_sha256,idempotency_key FROM sandbox_checkout_request_snapshots WHERE order_id=$1",[orderId]);
 assert.equal(row.rowCount,1);
 assert.equal(row.rows[0].request_sha256,snapshot.sha256);
 assert.equal(row.rows[0].idempotency_key,idempotencyKey);
 await assert.rejects(pool.query("UPDATE sandbox_checkout_request_snapshots SET request_sha256=$2 WHERE order_id=$1",[orderId,"f".repeat(64)]),/checkout_request_snapshot_immutable/);
 await assert.rejects(pool.query("DELETE FROM sandbox_checkout_request_snapshots WHERE order_id=$1",[orderId]),/checkout_request_snapshot_immutable/);
 const changed=makeV2CheckoutRequestSnapshot({orderId,ownerSubject,tier:"quick",idempotencyKey:"hwv2_other_fixture_key_123456789"});
 await assert.rejects(persistV2CheckoutRequestSnapshot({pool,snapshot:changed}),/snapshot_conflict/);
 await pool.query("UPDATE consultation_orders SET amount_minor=9900 WHERE id=$1",[orderId]);
 await assert.rejects(persistV2CheckoutRequestSnapshot({pool,snapshot}),/snapshot_conflict/);
 const kept=await pool.query("SELECT count(*)::int AS n FROM sandbox_checkout_request_snapshots WHERE order_id=$1",[orderId]);
 assert.equal(kept.rows[0].n,1);
 console.log("PASS: immutable Checkout snapshot persisted once; replay matches; mutation and changed-order retry fail without provider writes");
}finally{
 if(pool)await pool.end();
 if(created){
  const cleanup=await admin.connect();
  try{await cleanup.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');}
  finally{cleanup.release();}
 }
 await admin.end();
}
