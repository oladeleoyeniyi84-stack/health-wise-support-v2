/**
 * Disposable PostgreSQL checks for full monetary-context Checkout reservation.
 * No provider networking, payment, production DB or Replit dependency.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { assertDisposableDatabase } from "./support/disposable-db-guard.mjs";
import { reserveVerifiedV2SandboxAttempt } from "../src/integrations/stripe-v2-verified-attempt-reservation.mjs";
import { HEALTHWISE_V2_SANDBOX_CATALOG } from "../src/integrations/stripe-v2-catalog.mjs";

const connectionString=assertDisposableDatabase({
  url:process.env.HEALTHWISE_TEST_DATABASE_URL,
  ack:process.env.HEALTHWISE_ISOLATED_DB_ACK
});
const schema="hw_monetary_gate_"+process.pid;
const admin=new Pool({connectionString,max:2,connectionTimeoutMillis:3000});
const accountId="11111111-1111-4111-8111-111111111111";
const quick=HEALTHWISE_V2_SANDBOX_CATALOG.quick;
const ids=[
  "11111111-2222-4222-8222-000000000001",
  "11111111-2222-4222-8222-000000000002",
  "11111111-2222-4222-8222-000000000003",
  "11111111-2222-4222-8222-000000000004",
  "11111111-2222-4222-8222-000000000005",
  "11111111-2222-4222-8222-000000000006"
];
let created=false,pool;
const args=(orderId,idempotencyKey)=>({
  pool,orderId,idempotencyKey,priceId:quick.priceId,
  amountCents:quick.amountCents,currency:"usd",tier:"quick"
});
const key=(n)=>"healthwise_monetary_reservation_"+n+"_123456";
const count=async(id)=>{
  const r=await pool.query(
    "SELECT COUNT(*)::int AS count FROM sandbox_checkout_attempts WHERE order_id=$1",
    [id]
  );
  return r.rows[0].count;
};
try{
  const setup=await admin.connect();
  try{
    await setup.query('CREATE SCHEMA "'+schema+'"');
    created=true;
    await setup.query('SET search_path TO "'+schema+'",public');
    for(const file of ["001_foundation.sql","002_sandbox_checkout_attempts.sql"]){
      const sql=await readFile(new URL("../db/"+file,import.meta.url),"utf8");
      await setup.query(sql.replace(/^BEGIN;\s*/m,"").replace(/\s*COMMIT;\s*$/m,""));
    }
    await setup.query("INSERT INTO accounts(id,provider_subject) VALUES ($1,'monetary_test_user')",[accountId]);
  }finally{setup.release();}
  pool=new Pool({connectionString,max:5,connectionTimeoutMillis:3000,options:"-c search_path="+schema});
  for(const id of ids){
    await pool.query(
      "INSERT INTO consultation_orders(id,account_id,consultation_key,configured_price_id,currency,amount_minor) VALUES($1,$2,'quick',$3,'usd',4900)",
      [id,accountId,quick.priceId]
    );
  }
  const original=await reserveVerifiedV2SandboxAttempt(args(ids[0],key(0)));
  assert.equal(original.state,"prepared");
  assert.equal((await reserveVerifiedV2SandboxAttempt(args(ids[0],key(0)))).idempotencyKey,key(0));
  assert.equal(await count(ids[0]),1);
  await assert.rejects(reserveVerifiedV2SandboxAttempt(args(ids[0],key(99))),/checkout_attempt_conflict/);

  // Simulate values changing DURING remote provider preflight: revalidate
  // original pinned terms at the conditional INSERT; zero attempts created.
  const changes=[
    ["amount_minor",9900],
    ["currency","eur"],
    ["consultation_key","full"],
    ["status","paid"],
    ["configured_price_id","price_Other"]
  ];
  for(let i=0;i<changes.length;i++){
    const [column,value]=changes[i];
    const id=ids[i+1];
    // Only a constant internal allowlist supplies SQL column names.
    await pool.query("UPDATE consultation_orders SET "+column+"=$2 WHERE id=$1",[id,value]);
    await assert.rejects(reserveVerifiedV2SandboxAttempt(args(id,key(i+1))),/checkout_attempt_conflict/);
    assert.equal(await count(id),0);
  }

  // Two PostgreSQL connections racing with different keys for one pending
  // order: database PK and immutable key checks allow at most one winner.
  const raceId="11111111-2222-4222-8222-000000000007";
  await pool.query(
    "INSERT INTO consultation_orders(id,account_id,consultation_key,configured_price_id,currency,amount_minor) VALUES($1,$2,'quick',$3,'usd',4900)",
    [raceId,accountId,quick.priceId]
  );
  const raced=await Promise.allSettled([
    reserveVerifiedV2SandboxAttempt(args(raceId,key(71))),
    reserveVerifiedV2SandboxAttempt(args(raceId,key(72)))
  ]);
  assert.equal(raced.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(raced.filter(r=>r.status==="rejected").length,1);
  assert.match(raced.find(r=>r.status==="rejected").reason.message,/checkout_attempt_conflict/);
  assert.equal(await count(raceId),1);
  const winner=raced.find(r=>r.status==="fulfilled").value.idempotencyKey;
  assert.equal((await reserveVerifiedV2SandboxAttempt(args(raceId,winner))).idempotencyKey,winner);

  // An existing journal entry cannot legitimize an idempotent retry after
  // financial terms have changed.
  await pool.query("UPDATE consultation_orders SET amount_minor=9900 WHERE id=$1",[ids[0]]);
  await assert.rejects(reserveVerifiedV2SandboxAttempt(args(ids[0],key(0))),/checkout_attempt_conflict/);
  assert.equal(await count(ids[0]),1);

  console.log("PASS: disposable PostgreSQL enforces immutable amount/currency/tier/price/status and serializes competing Checkout reservations");
}finally{
  if(pool)await pool.end();
  if(created){
    const cleanup=await admin.connect();
    try{await cleanup.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');}
    finally{cleanup.release();}
  }
  await admin.end();
}
