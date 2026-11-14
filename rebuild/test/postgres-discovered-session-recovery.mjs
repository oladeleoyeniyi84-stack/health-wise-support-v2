/** Disposable PostgreSQL + offline Stripe full discovery/recovery integration.
 * Strictly isolated CI database. No real provider network or payments.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { assertDisposableDatabase } from "./support/disposable-db-guard.mjs";
import { reserveSandboxCheckoutAttempt } from "../src/integrations/sandbox-checkout-attempts.mjs";
import { recoverDiscoveredV2SandboxSession } from "../src/integrations/sandbox-discovered-session-recovery.mjs";
import { HEALTHWISE_V2_SANDBOX_ACCOUNT, HEALTHWISE_V2_SANDBOX_CATALOG } from "../src/integrations/stripe-v2-catalog.mjs";

const connectionString=assertDisposableDatabase({
  url:process.env.HEALTHWISE_TEST_DATABASE_URL,
  ack:process.env.HEALTHWISE_ISOLATED_DB_ACK
});
const admin=new Pool({connectionString,max:2,connectionTimeoutMillis:3000});
const schema="hw_discovery_recovery_"+process.pid;
const accountId="11111111-1111-4111-8111-111111111111";
const orders=[
  "aaaaaaaa-0000-4000-8000-000000000001",
  "aaaaaaaa-0000-4000-8000-000000000002",
  "aaaaaaaa-0000-4000-8000-000000000003",
  "aaaaaaaa-0000-4000-8000-000000000004"
];
const price=HEALTHWISE_V2_SANDBOX_CATALOG.quick;
let created=false,pool;
const fakeStripe=(orderId,options={})=>{
  const id="cs_test_Discovery"+orderId.slice(-1);
  const match={id,livemode:false,mode:"payment",client_reference_id:"synthetic_member",metadata:{orderId,consultationKey:"quick"}};
  let count=0;
  return {
    accounts:{retrieve:async()=>({object:"account",id:HEALTHWISE_V2_SANDBOX_ACCOUNT})},
    balance:{retrieve:async()=>({object:"balance",livemode:false})},
    checkout:{sessions:{
      list:async()=>({has_more:options.truncated===true,data:options.duplicates?[match,{...match,id:"cs_test_Extra"+orderId.slice(-1)}]:[match]}),
      retrieve:async()=>{count++;if(options.providerFailure) throw Error("offline_provider_failure");
        return {...match,status:"open",amount_total:options.changeOnSecondRead&&count===2?9900:4900,currency:"usd"};},
      listLineItems:async()=>({has_more:false,data:[{quantity:1,amount_total:4900,price:{id:price.priceId}}]})
    }}
  };
};
const check=async(orderId)=>{
  const result=await pool.query(
    `SELECT o.stripe_session_id AS order_session,a.stripe_session_id AS attempt_session,a.state
       FROM consultation_orders o JOIN sandbox_checkout_attempts a ON a.order_id=o.id
       WHERE o.id=$1`,[orderId]
  );
  return result.rows[0];
};
try {
  const setup=await admin.connect();
  try {
    await setup.query('CREATE SCHEMA "'+schema+'"');
    created=true;
    await setup.query('SET search_path TO "'+schema+'",public');
    for(const file of ["001_foundation.sql","002_sandbox_checkout_attempts.sql"]){
      const sql=await readFile(new URL("../db/"+file,import.meta.url),"utf8");
      await setup.query(sql.replace(/^BEGIN;\s*/m,"").replace(/\s*COMMIT;\s*$/m,""));
    }
    await setup.query("INSERT INTO accounts(id,provider_subject) VALUES ($1,'synthetic_member')",[accountId]);
  } finally {setup.release();}
  pool=new Pool({connectionString,max:5,connectionTimeoutMillis:3000,options:"-c search_path="+schema});
  // Capture the search clock AFTER all attempt journal timestamps exist.
  for(let i=0;i<orders.length;i++){
    const id=orders[i];
    await pool.query(
      "INSERT INTO consultation_orders(id,account_id,consultation_key,configured_price_id,currency,amount_minor) VALUES($1,$2,'quick',$3,'usd',4900)",
      [id,accountId,price.priceId]
    );
    await reserveSandboxCheckoutAttempt({pool,orderId:id,priceId:price.priceId,idempotencyKey:"healthwise_discovery_unique_"+i+"_123456"});
  }
  const now=new Date();
  const recover=(id,opts={})=>recoverDiscoveredV2SandboxSession({
    stripe:fakeStripe(id,opts),pool,orderId:id,now,maxPages:1
  });
  const first=await recover(orders[0]);
  assert.equal(first.action,"bound");
  const bound=await check(orders[0]);
  assert.equal(bound.order_session,bound.attempt_session);
  assert.equal(bound.state,"bound");

  for(const opts of [{duplicates:true},{truncated:true}]){
    const outcome=await recover(orders[1],opts);
    assert.equal(outcome.action,"manual_review");
    assert.deepEqual(await check(orders[1]),{order_session:null,attempt_session:null,state:"prepared"});
  }
  await assert.rejects(recover(orders[1],{providerFailure:true}),/offline_provider_failure/);
  assert.deepEqual(await check(orders[1]),{order_session:null,attempt_session:null,state:"prepared"});
  await assert.rejects(recover(orders[1],{changeOnSecondRead:true}),/orphan_session_mismatch/);
  assert.deepEqual(await check(orders[1]),{order_session:null,attempt_session:null,state:"prepared"});

  // Two simultaneous discovery/verification calls for same order cannot
  // overwrite each other's session binding after the row locks are acquired.
  const results=await Promise.allSettled([recover(orders[2]),recover(orders[2])]);
  // One may read the completed binding and fail early; both may also
  // complete idempotently if discovery finished before the first commit.
  assert.ok(results.some(x=>x.status==="fulfilled"));
  for(const r of results) {
    if(r.status==="fulfilled") assert.ok(["bound","already_bound"].includes(r.value.action));
    else assert.match(r.reason.message,/discovery_order_mismatch|recovery_order_mismatch|recovery_binding_conflict/);
  }
  const concurrent=await check(orders[2]);
  assert.equal(concurrent.state,"bound");
  assert.equal(concurrent.order_session,concurrent.attempt_session);

  // Trigger a second-record failure; the first order UPDATE must roll back.
  const functionName="fail_discovery_"+process.pid;
  await pool.query(`CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql
    AS $discovery$ BEGIN RAISE EXCEPTION 'discovery_journal_failed'; END; $discovery$`);
  await pool.query(`CREATE TRIGGER "${functionName}" BEFORE UPDATE ON sandbox_checkout_attempts
    FOR EACH ROW WHEN (NEW.order_id = '${orders[3]}'::uuid)
    EXECUTE FUNCTION "${functionName}"()`);
  await assert.rejects(recover(orders[3]),/discovery_journal_failed/);
  assert.deepEqual(await check(orders[3]),{order_session:null,attempt_session:null,state:"prepared"});
  console.log("PASS: disposable PostgreSQL full discovery-to-recovery, truncation, provider failure, concurrent bind, and rollback");
} finally {
  if(pool) await pool.end();
  if(created){
    const clean=await admin.connect();
    try {await clean.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');}
    finally {clean.release();}
  }
  await admin.end();
}
