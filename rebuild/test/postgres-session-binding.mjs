/**
 * Disposable PostgreSQL integration test for atomic sandbox session binding.
 * Never run with production credentials.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { assertDisposableDatabase } from "./support/disposable-db-guard.mjs";
import { bindSandboxCheckoutSession } from "../src/integrations/sandbox-session-binding.mjs";

const url=assertDisposableDatabase({
  url:process.env.HEALTHWISE_TEST_DATABASE_URL,
  ack:process.env.HEALTHWISE_ISOLATED_DB_ACK
});
const admin=new Pool({connectionString:url,max:3,connectionTimeoutMillis:3000});
const schema="hw_session_binding_"+process.pid;
const accountId="11111111-1111-4111-8111-111111111111";
const orderA="66666666-6666-4666-8666-666666666666";
const orderB="77777777-7777-4777-8777-777777777777";
const priceId="price_Abc123";
let created=false;
let scoped;
try {
  const migration=await readFile(new URL("../db/001_foundation.sql",import.meta.url),"utf8");
  const ddl=migration.replace(/^BEGIN;\s*/m,"").replace(/\s*COMMIT;\s*$/m,"");
  const setup=await admin.connect();
  try {
    await setup.query('CREATE SCHEMA "'+schema+'"');
    created=true;
    await setup.query('SET search_path TO "'+schema+'", public');
    await setup.query(ddl);
    await setup.query("INSERT INTO accounts(id,provider_subject) VALUES ($1,'binding_user')",[accountId]);
    for (const id of [orderA,orderB]) {
      await setup.query(
        "INSERT INTO consultation_orders(id,account_id,consultation_key,configured_price_id,currency,amount_minor) VALUES ($1,$2,'quick',$3,'usd',4900)",
        [id,accountId,priceId]
      );
    }
  } finally {setup.release();}
  scoped=new Pool({connectionString:url,max:4,connectionTimeoutMillis:3000,options:"-c search_path="+schema});
  const bind=(orderId,sessionId,customPrice=priceId)=>bindSandboxCheckoutSession({pool:scoped,orderId,sessionId,priceId:customPrice});

  // Concurrent calls racing to bind different sessions to the same pending order:
  // exactly one wins; the other fails with a conflict after its guarded UPDATE.
  const raced=await Promise.allSettled([
    bind(orderA,"cs_test_bindingA"),
    bind(orderA,"cs_test_bindingB")
  ]);
  assert.equal(raced.filter(x=>x.status==="fulfilled").length,1);
  assert.equal(raced.filter(x=>x.status==="rejected").length,1);
  assert.match(raced.find(x=>x.status==="rejected").reason.message,/session_binding_conflict/);
  const winner=raced.find(x=>x.status==="fulfilled").value.sessionId;
  assert.deepEqual(await bind(orderA,winner),{orderId:orderA,sessionId:winner,action:"already_bound"});

  // Unique session constraint forbids assigning the same Stripe session to a
  // second order, even when both orders are pending.
  await assert.rejects(bind(orderB,winner),e=>e?.code==="23505");
  const other=await scoped.query("SELECT stripe_session_id,status FROM consultation_orders WHERE id=$1",[orderB]);
  assert.equal(other.rows[0].stripe_session_id,null);
  assert.equal(other.rows[0].status,"pending");

  // An incorrect price never binds the pending second order.
  await assert.rejects(bind(orderB,"cs_test_wrongPrice","price_Wrong999"),/session_binding_conflict/);
  assert.deepEqual(await bind(orderB,"cs_test_secondOrder"),{
    orderId:orderB,sessionId:"cs_test_secondOrder",action:"bound"
  });

  // A paid order cannot be rebound, even if the caller uses its existing session.
  await scoped.query("UPDATE consultation_orders SET status='paid' WHERE id=$1",[orderB]);
  await assert.rejects(bind(orderB,"cs_test_secondOrder"),/session_binding_conflict/);
  const rows=await scoped.query("SELECT id,stripe_session_id,status FROM consultation_orders WHERE id IN ($1,$2)",[orderA,orderB]);
  assert.equal(rows.rowCount,2);
  assert.equal(new Set(rows.rows.map(x=>x.stripe_session_id)).size,2);
  console.log("PASS: disposable PostgreSQL atomically binds sessions, rejects races and duplicates, and fails closed on status/price mismatch");
} finally {
  if(scoped)await scoped.end();
  if(created) {
    const cleanup=await admin.connect();
    try {await cleanup.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');}
    finally {cleanup.release();}
  }
  await admin.end();
}
