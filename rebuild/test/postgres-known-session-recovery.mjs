/**
 * Isolated end-to-end RECOVERY test using disposable PostgreSQL and a simulated
 * Stripe read-only client. No real Stripe requests, Replit or production data.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { assertDisposableDatabase } from "./support/disposable-db-guard.mjs";
import { reserveSandboxCheckoutAttempt } from "../src/integrations/sandbox-checkout-attempts.mjs";
import { recoverKnownV2SandboxSession } from "../src/integrations/sandbox-known-session-recovery.mjs";
import { HEALTHWISE_V2_SANDBOX_ACCOUNT, HEALTHWISE_V2_SANDBOX_CATALOG } from "../src/integrations/stripe-v2-catalog.mjs";

const connectionString=assertDisposableDatabase({
  url:process.env.HEALTHWISE_TEST_DATABASE_URL,
  ack:process.env.HEALTHWISE_ISOLATED_DB_ACK
});
const schema="hw_known_recovery_"+process.pid;
const admin=new Pool({connectionString,max:2,connectionTimeoutMillis:3000});
let pool, schemaCreated=false;
const accountId="11111111-1111-4111-8111-111111111111";
const price=HEALTHWISE_V2_SANDBOX_CATALOG.quick;
const orderIds=[
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
];
const mkStripe=(orderId,sessionId,{wrongAccount=false,live=false,wrongPrice=false,outage=false,status="open"}={})=>({
  accounts:{retrieve:async()=>({object:"account",id:wrongAccount?"acct_other":HEALTHWISE_V2_SANDBOX_ACCOUNT})},
  balance:{retrieve:async()=>({object:"balance",livemode:live})},
  checkout:{sessions:{
    retrieve:async()=>{if(outage)throw Error("simulated_provider_outage");return {
      id:sessionId,livemode:false,mode:"payment",status,
      client_reference_id:"synthetic_member",
      metadata:{orderId,consultationKey:"quick"},
      amount_total:4900,currency:"usd"
    };},
    listLineItems:async()=>({has_more:false,data:[{
      quantity:1,amount_total:4900,
      price:{id:wrongPrice?"price_wrong123":price.priceId}
    }]})
  }}
});
async function seed(orderId,key){
  await pool.query(
    "INSERT INTO consultation_orders(id,account_id,consultation_key,configured_price_id,currency,amount_minor) VALUES ($1,$2,'quick',$3,'usd',4900)",
    [orderId,accountId,price.priceId]
  );
  await reserveSandboxCheckoutAttempt({pool,orderId,priceId:price.priceId,idempotencyKey:key});
}
async function state(orderId){
  const r=await pool.query(
    `SELECT o.status,o.stripe_session_id AS order_session,a.state AS attempt_state,
        a.stripe_session_id AS attempt_session
       FROM consultation_orders o JOIN sandbox_checkout_attempts a ON a.order_id=o.id
      WHERE o.id=$1`,[orderId]
  );
  return r.rows[0];
}
const recover=(orderId,sessionId,options)=>recoverKnownV2SandboxSession({
  pool,stripe:mkStripe(orderId,sessionId,options),orderId,sessionId
});
try {
  const setup=await admin.connect();
  try {
    await setup.query('CREATE SCHEMA "'+schema+'"');
    schemaCreated=true;
    await setup.query('SET search_path TO "'+schema+'",public');
    for (const file of ["001_foundation.sql","002_sandbox_checkout_attempts.sql"]){
      const migration=await readFile(new URL("../db/"+file,import.meta.url),"utf8");
      await setup.query(migration.replace(/^BEGIN;\s*/m,"").replace(/\s*COMMIT;\s*$/m,""));
    }
    await setup.query("INSERT INTO accounts(id,provider_subject) VALUES($1,'synthetic_member')",[accountId]);
  } finally {setup.release();}
  pool=new Pool({connectionString,max:5,connectionTimeoutMillis:3000,options:"-c search_path="+schema});
  for (let i=0;i<orderIds.length;i++){
    await seed(orderIds[i],"healthwise_known_recovery_key_"+i+"_12345");
  }

  const firstSession="cs_test_knownRecoveryA";
  const ok=await recover(orderIds[0],firstSession);
  assert.equal(ok.action,"bound");
  assert.deepEqual(await state(orderIds[0]),{
    status:"pending",order_session:firstSession,
    attempt_state:"bound",attempt_session:firstSession
  });
  assert.equal((await recover(orderIds[0],firstSession)).action,"already_bound");

  // Provider outage or misconfigured environment must not alter either row.
  for(const options of [{outage:true},{wrongAccount:true},{live:true},{wrongPrice:true}]){
    await assert.rejects(recover(orderIds[1],"cs_test_knownRecoveryB",options));
    assert.deepEqual(await state(orderIds[1]),{
      status:"pending",order_session:null,
      attempt_state:"prepared",attempt_session:null
    });
  }
  assert.deepEqual(await recover(orderIds[1],"cs_test_knownRecoveryB",{status:"complete"}),{
    action:"manual_review",reason:"session_not_open",orderId:orderIds[1]
  });
  assert.equal((await state(orderIds[1])).order_session,null);

  // Two concurrent recoveries with different sessions: only one can bind.
  const raced=await Promise.allSettled([
    recover(orderIds[2],"cs_test_knownRecoveryC1"),
    recover(orderIds[2],"cs_test_knownRecoveryC2")
  ]);
  assert.equal(raced.filter(x=>x.status==="fulfilled").length,1);
  assert.equal(raced.filter(x=>x.status==="rejected").length,1);
  const winner=raced.find(x=>x.status==="fulfilled").value.sessionId;
  const persisted=await state(orderIds[2]);
  assert.equal(persisted.order_session,winner);
  assert.equal(persisted.attempt_session,winner);
  assert.equal(persisted.attempt_state,"bound");

  // Database error between updates must atomically roll back both rows.
  const triggerName="hw_recovery_fail_"+process.pid;
  await pool.query(`CREATE FUNCTION "${triggerName}"() RETURNS trigger LANGUAGE plpgsql
    AS $$ BEGIN RAISE EXCEPTION 'journal_write_failed'; END; $$`);
  await pool.query(`CREATE TRIGGER "${triggerName}" BEFORE UPDATE ON sandbox_checkout_attempts
    FOR EACH ROW WHEN (NEW.order_id = '${orderIds[3]}'::uuid)
    EXECUTE FUNCTION "${triggerName}"()`);
  await assert.rejects(recover(orderIds[3],"cs_test_knownRecoveryD"),/journal_write_failed/);
  assert.deepEqual(await state(orderIds[3]),{
    status:"pending",order_session:null,attempt_state:"prepared",attempt_session:null
  });
  console.log("PASS: isolated PostgreSQL known-session recovery verifies provider, preserves failures, serializes races, and rolls back both records");
} finally {
  if(pool)await pool.end();
  if(schemaCreated){
    const cleanup=await admin.connect();
    try {await cleanup.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');}
    finally {cleanup.release();}
  }
  await admin.end();
}
