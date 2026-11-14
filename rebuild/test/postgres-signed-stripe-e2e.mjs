/**
 * Offline Stripe SDK signed webhook -> actual disposable PostgreSQL repository.
 * Only synthetic fixtures; no Stripe API call, real payment or public route.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import Stripe from "stripe";
import { assertDisposableDatabase } from "./support/disposable-db-guard.mjs";
import { createEventRepository } from "../src/integrations/postgres-events.mjs";
import { processSignedSandboxReconciliation } from "../src/integrations/signed-reconciliation.mjs";

const connectionString=assertDisposableDatabase({
  url:process.env.HEALTHWISE_TEST_DATABASE_URL,
  ack:process.env.HEALTHWISE_ISOLATED_DB_ACK
});
const schema="hw_signed_pg_"+process.pid;
const admin=new Pool({connectionString,max:2,connectionTimeoutMillis:3000});
const stripe=new Stripe("sk_test_offlineFixtureOnly",{apiVersion:"2025-02-24.acacia"});
const secret="whsec_disposable_offline_123";
const accountId="11111111-1111-4111-8111-111111111111";
const orderId="22222222-2222-4222-8222-222222222222";
const priceId="price_OfflineHealthwise123";
const sessionId="cs_test_SignedDb123";
const providerSubject="synthetic_user_123";
let pool,created=false;
try{
  const setup=await admin.connect();
  try{
    await setup.query('CREATE SCHEMA "'+schema+'"');
    created=true;
    await setup.query('SET search_path TO "'+schema+'",public');
    const sql=await readFile(new URL("../db/001_foundation.sql",import.meta.url),"utf8");
    await setup.query(sql.replace(/^BEGIN;\s*/m,"").replace(/\s*COMMIT;\s*$/m,""));
    await setup.query("INSERT INTO accounts(id,provider_subject) VALUES ($1,$2)",[accountId,providerSubject]);
    await setup.query(
      "INSERT INTO consultation_orders(id,account_id,consultation_key,configured_price_id,currency,amount_minor,stripe_session_id) VALUES($1,$2,'quick',$3,'usd',4900,$4)",
      [orderId,accountId,priceId,sessionId]
    );
  }finally{setup.release();}

  pool=new Pool({connectionString,max:5,connectionTimeoutMillis:3000,options:"-c search_path="+schema});
  const repository=createEventRepository(pool);
  let providerCalls=0;
  stripe.checkout.sessions.listLineItems=async id=>{
    providerCalls++;
    assert.equal(id,sessionId);
    return {has_more:false,data:[{quantity:1,amount_total:4900,price:{id:priceId,active:true,currency:"usd"}}]};
  };
  const baseEvent={
    id:"evt_SignedDb123",type:"checkout.session.completed",livemode:false,
    data:{object:{
      id:sessionId,livemode:false,mode:"payment",payment_status:"paid",
      client_reference_id:providerSubject,amount_total:4900,currency:"usd",
      metadata:{orderId,consultationKey:"quick"}
    }}
  };
  const signed=event=>{
    const rawBody=Buffer.from(JSON.stringify(event));
    const signature=stripe.webhooks.generateTestHeaderString({payload:rawBody.toString("utf8"),secret});
    return {rawBody,signature,endpointSecret:secret,stripe,repository};
  };
  const state=async()=>{
    const result=await pool.query(
      `SELECT o.status,
              (SELECT count(*)::int FROM booking_entitlements b WHERE b.order_id=o.id) AS entitlements,
              (SELECT count(*)::int FROM provider_events e WHERE e.order_id=o.id) AS events
         FROM consultation_orders o WHERE o.id=$1`,[orderId]
    );
    return result.rows[0];
  };

  // Wrong signature/tampering must never reach the provider or database.
  const first=signed(baseEvent);
  await assert.rejects(
    processSignedSandboxReconciliation({...first,rawBody:Buffer.concat([first.rawBody,Buffer.from(" ")])}),
    /invalid_webhook_signature/
  );
  assert.equal(providerCalls,0);
  assert.deepEqual(await state(),{status:"pending",entitlements:0,events:0});

  // A temporary provider failure does not record an event ID, leaving retry safe.
  const original=stripe.checkout.sessions.listLineItems;
  stripe.checkout.sessions.listLineItems=async()=>{throw Error("simulated_provider_outage");};
  await assert.rejects(processSignedSandboxReconciliation(first),/stripe_lookup_retryable/);
  stripe.checkout.sessions.listLineItems=original;
  assert.deepEqual(await state(),{status:"pending",entitlements:0,events:0});

  // Real SDK verifies signature; real DB transaction updates order and creates
  // one pending entitlement. Two parallel event deliveries are idempotent.
  const decisions=await Promise.all([
    processSignedSandboxReconciliation(first),
    processSignedSandboxReconciliation(first)
  ]);
  assert.deepEqual(decisions.map(d=>d.action).sort(),["duplicate","mark_paid"]);
  assert.deepEqual(await state(),{status:"paid",entitlements:1,events:1});

  // Distinct event ID for the same paid Checkout never creates second entitlement.
  const second=await processSignedSandboxReconciliation(signed({...baseEvent,id:"evt_SignedDb124"}));
  assert.equal(second.action,"ignore");
  assert.deepEqual(await state(),{status:"paid",entitlements:1,events:2});
  console.log("PASS: real offline Stripe SDK signature -> disposable PostgreSQL payment, one entitlement, duplicate replay, provider outage and tamper rejection");
}finally{
  if(pool)await pool.end();
  if(created){
    const cleanup=await admin.connect();
    try{await cleanup.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');}
    finally{cleanup.release();}
  }
  await admin.end();
}
