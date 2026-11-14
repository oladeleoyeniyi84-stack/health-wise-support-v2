/** Disposal-only PostgreSQL proof for exact Checkout URLs and full request hash. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { assertDisposableDatabase } from "./support/disposable-db-guard.mjs";
import { makeV2CheckoutRequestSnapshot,persistV2CheckoutRequestSnapshot } from "../src/integrations/stripe-v2-request-snapshot.mjs";
import { makeV2FullCheckoutRequestFingerprint,persistV2FullCheckoutRequestFingerprint } from "../src/integrations/stripe-v2-full-request-fingerprint.mjs";
import { auditLockedV2CheckoutRequest } from "../src/integrations/stripe-v2-locked-request-audit.mjs";
import { claimBlockedV2CheckoutDispatch, inspectBlockedV2Dispatch } from "../src/integrations/stripe-v2-blocked-dispatch-ledger.mjs";
import { appendBlockedV2ReviewEvidence } from "../src/integrations/stripe-v2-review-evidence.mjs";

const url=assertDisposableDatabase({url:process.env.HEALTHWISE_TEST_DATABASE_URL,ack:process.env.HEALTHWISE_ISOLATED_DB_ACK});
const schema="hw_full_req_"+process.pid;
const admin=new Pool({connectionString:url,max:2,connectionTimeoutMillis:3000});
const orderId="33333333-3333-4333-8333-333333333333";
const accountId="11111111-1111-4111-8111-111111111111";
const snapshot=makeV2CheckoutRequestSnapshot({
  orderId,ownerSubject:"synthetic_full_request_owner",tier:"quick",
  idempotencyKey:"hwv2_full_pg_snapshot_key_123456"
});
const origin="https://sandbox.example.net";
const input={snapshot,returnOrigin:origin,approvedReturnOrigin:origin};
let created=false,pool;
try{
  const setup=await admin.connect();
  try{
    await setup.query('CREATE SCHEMA "'+schema+'"');
    created=true;
    await setup.query('SET search_path TO "'+schema+'",public');
    for(const filename of ["001_foundation.sql","002_sandbox_checkout_attempts.sql",
      "003_immutable_order_ownership.sql","004_checkout_request_snapshots.sql",
      "005_checkout_full_request_fingerprint.sql", "006_checkout_dispatch_ledger.sql",
      "007_checkout_review_evidence.sql"]){
      const sql=await readFile(new URL("../db/"+filename,import.meta.url),"utf8");
      await setup.query(sql.replace(/^BEGIN;\s*/m,"").replace(/\s*COMMIT;\s*$/m,""));
    }
    await setup.query("INSERT INTO accounts(id,provider_subject) VALUES($1,$2)",[accountId,snapshot.terms.ownerSubject]);
    await setup.query("INSERT INTO consultation_orders(id,account_id,consultation_key,configured_price_id,currency,amount_minor) VALUES($1,$2,'quick',$3,'usd',4900)",[orderId,accountId,snapshot.terms.stripePriceId]);
    await setup.query("INSERT INTO sandbox_checkout_attempts(order_id,configured_price_id,idempotency_key) VALUES($1,$2,$3)",[orderId,snapshot.terms.stripePriceId,snapshot.terms.idempotencyKey]);
  }finally{setup.release();}
  pool=new Pool({connectionString:url,max:4,connectionTimeoutMillis:3000,options:"-c search_path="+schema});
  assert.equal((await persistV2CheckoutRequestSnapshot({pool,snapshot})).action,"snapshot_recorded");
  assert.equal((await persistV2FullCheckoutRequestFingerprint({pool,...input})).action,"full_request_recorded");
  assert.equal((await persistV2FullCheckoutRequestFingerprint({pool,...input})).action,"full_request_already_recorded");
  const auditInput={
    pool,snapshot,expectedOwnerSubject:snapshot.terms.ownerSubject,
    returnOrigin:origin,approvedReturnOrigin:origin
  };
  const verified=await auditLockedV2CheckoutRequest(auditInput);
  assert.equal(verified.action,"audit_verified_only");
  assert.equal(verified.providerWriteAuthorized,false);
  assert.equal(verified.release,"blocked");
  // Two workers racing for the same order may claim uncertainty ONCE.
  const claims=await Promise.allSettled([
    claimBlockedV2CheckoutDispatch({
      ...auditInput,now:new Date()
    }),
    claimBlockedV2CheckoutDispatch({
      ...auditInput,now:new Date()
    })
  ]);
  assert.equal(claims.filter(x=>x.status==="fulfilled").length,1);
  assert.equal(claims.filter(x=>x.status==="rejected").length,1);
  assert.match(String(claims.find(x=>x.status==="rejected").reason),/dispatch_already_claimed_requires_review/);
  assert.equal(claims.find(x=>x.status==="fulfilled").value.providerWriteAuthorized,false);
  assert.equal(claims.find(x=>x.status==="fulfilled").value.retryAllowed,false);
  assert.equal((await inspectBlockedV2Dispatch({pool,orderId})).retryAllowed,false);
  const ledger=await pool.query("SELECT state,request_sha256 FROM sandbox_checkout_dispatch_ledger WHERE order_id=$1",[orderId]);
  assert.equal(ledger.rowCount,1);
  assert.equal(ledger.rows[0].state,"outcome_uncertain");
  await assert.rejects(
    pool.query("DELETE FROM sandbox_checkout_dispatch_ledger WHERE order_id=$1",[orderId]),
    /dispatch_ledger_delete_forbidden/
  );
  await assert.rejects(
    pool.query("UPDATE sandbox_checkout_dispatch_ledger SET state='outcome_uncertain' WHERE order_id=$1",[orderId]),
    /dispatch_ledger_immutable/
  );

  const evidence={
    pool,orderId,requestSha256:ledger.rows[0].request_sha256,
    evidenceKind:"provider_lookup_incomplete",evidenceSha256:"c".repeat(64),
    resolveOperator:async()=>({authenticated:true,id:"synthetic_reviewer",permissions:["healthwise.checkout.review_evidence"]})
  };
  assert.equal((await appendBlockedV2ReviewEvidence(evidence)).action,"evidence_recorded");
  assert.equal((await appendBlockedV2ReviewEvidence(evidence)).action,"evidence_already_recorded");
  await assert.rejects(appendBlockedV2ReviewEvidence({
    ...evidence,requestSha256:"f".repeat(64)
  }),/review_evidence_conflict/);
  await assert.rejects(pool.query(
    "UPDATE sandbox_checkout_review_evidence SET evidence_sha256=$2 WHERE order_id=$1",
    [orderId,"d".repeat(64)]
  ),/review_evidence_immutable/);
  await assert.rejects(pool.query(
    "DELETE FROM sandbox_checkout_review_evidence WHERE order_id=$1",[orderId]
  ),/review_evidence_immutable/);
  await pool.query("UPDATE sandbox_checkout_dispatch_ledger SET state='manual_review',reviewed_at=now() WHERE order_id=$1",[orderId]);
  await assert.rejects(
    pool.query("UPDATE sandbox_checkout_dispatch_ledger SET state='outcome_uncertain',reviewed_at=NULL WHERE order_id=$1",[orderId]),
    /dispatch_ledger_immutable/
  );
  assert.equal((await inspectBlockedV2Dispatch({pool,orderId})).retryAllowed,false);
  assert.equal((await appendBlockedV2ReviewEvidence({
    ...evidence,evidenceKind:"manual_escalation",evidenceSha256:"e".repeat(64)
  })).action,"evidence_recorded");
  assert.equal((await pool.query(
    "SELECT COUNT(*)::int AS n FROM sandbox_checkout_review_evidence WHERE order_id=$1",[orderId]
  )).rows[0].n,2);
  const old=makeV2FullCheckoutRequestFingerprint(input);
  const row=await pool.query("SELECT request_sha256,success_url,cancel_url FROM sandbox_checkout_full_requests WHERE order_id=$1",[orderId]);
  assert.equal(row.rowCount,1);
  assert.equal(row.rows[0].request_sha256,old.requestSha256);
  assert.equal(row.rows[0].success_url,old.successUrl);
  assert.equal(row.rows[0].cancel_url,old.cancelUrl);
  await assert.rejects(pool.query("UPDATE sandbox_checkout_full_requests SET success_url=$2 WHERE order_id=$1",[orderId,"https://attacker.example.net"]),/checkout_full_request_immutable/);
  await assert.rejects(pool.query("DELETE FROM sandbox_checkout_full_requests WHERE order_id=$1",[orderId]),/checkout_full_request_immutable/);
  await assert.rejects(persistV2FullCheckoutRequestFingerprint({
    pool,snapshot,returnOrigin:"https://other.example.net",approvedReturnOrigin:"https://other.example.net"
  }),/full_request_conflict/);
  await pool.query("UPDATE consultation_orders SET amount_minor=9900 WHERE id=$1",[orderId]);
  await assert.rejects(auditLockedV2CheckoutRequest(auditInput),/locked_checkout_request_mismatch/);
  await assert.rejects(persistV2FullCheckoutRequestFingerprint({pool,...input}),/full_request_conflict/);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM sandbox_checkout_full_requests WHERE order_id=$1",[orderId])).rows[0].n,1);
  console.log("PASS: immutable full Checkout request hash includes both URLs and forbids mutation, origin swaps or changed monetary terms");
}finally{
  if(pool)await pool.end();
  if(created){
    const cleanup=await admin.connect();
    try{await cleanup.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');}
    finally{cleanup.release();}
  }
  await admin.end();
}
