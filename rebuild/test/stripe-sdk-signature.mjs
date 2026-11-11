/**
 * Real Stripe SDK signature verification, fully offline.
 * Uses synthetic events and a synthetic webhook secret; never calls Stripe API.
 */
import assert from "node:assert/strict";
import Stripe from "stripe";
import { processSignedSandboxReconciliation } from "../src/integrations/signed-reconciliation.mjs";
const stripe = new Stripe("sk_test_offlineFixtureOnly", { apiVersion: "2025-02-24.acacia" });
const endpointSecret = "whsec_offlineFixtureOnly";
const event = {
  id:"evt_Offline123", type:"checkout.session.completed", livemode:false,
  data:{object:{
    id:"cs_test_Offline123", livemode:false, mode:"payment", payment_status:"paid",
    client_reference_id:"user1", amount_total:1500, currency:"usd",
    metadata:{orderId:"order1",consultationKey:"quick"}
  }}
};
const rawBody = Buffer.from(JSON.stringify(event));
const signature = stripe.webhooks.generateTestHeaderString({
  payload: rawBody.toString("utf8"), secret: endpointSecret
});
const order = {
  id:"order1", userId:"user1", stripeSessionId:"cs_test_Offline123",
  status:"pending", amountMinor:1500, currency:"usd",
  consultationKey:"quick", configuredPriceId:"price_Offline123"
};
const steps=[];
stripe.checkout.sessions.listLineItems = async sessionId => {
  steps.push("provider");
  assert.equal(sessionId, "cs_test_Offline123");
  return {has_more:false,data:[{
    quantity:1, amount_total:1500,
    price:{id:"price_Offline123",active:true,currency:"usd"}
  }]};
};
const repository = {
  async findOrderBySession(){steps.push("snapshot");return order;},
  async transaction(fn){steps.push("transaction");return fn({
    async lockOrderBySession(){return order;},
    async recordEventOnce(){return true;},
    async applyDecision(d){assert.equal(d.action,"mark_paid");}
  });}
};
const valid = await processSignedSandboxReconciliation({
  rawBody, signature, endpointSecret, stripe, repository
});
assert.equal(valid.action,"mark_paid");
assert.deepEqual(steps,["snapshot","provider","transaction"]);
steps.length=0;
await assert.rejects(processSignedSandboxReconciliation({
  rawBody:Buffer.from(rawBody.toString("utf8")+" "),
  signature, endpointSecret, stripe, repository
}),/invalid_webhook_signature/);
assert.deepEqual(steps,[]);
await assert.rejects(processSignedSandboxReconciliation({
  rawBody, signature:"t=123,v1=invalid", endpointSecret, stripe, repository
}),/invalid_webhook_signature/);
assert.deepEqual(steps,[]);
console.log("PASS: real Stripe SDK verifies synthetic signed payload and rejects tampering/invalid signature before DB access");
steps.length = 0;
// A transient provider outage after successful signature verification must
// preserve the event for a later retry, without beginning a DB transaction.
const originalLookup = stripe.checkout.sessions.listLineItems;
stripe.checkout.sessions.listLineItems = async () => {
  steps.push("provider-outage");
  throw new Error("temporary_network_failure");
};
await assert.rejects(processSignedSandboxReconciliation({
  rawBody, signature, endpointSecret, stripe, repository
}), /stripe_lookup_retryable/);
assert.deepEqual(steps, ["snapshot", "provider-outage"]);
steps.length = 0;
stripe.checkout.sessions.listLineItems = originalLookup;
const retry = await processSignedSandboxReconciliation({
  rawBody, signature, endpointSecret, stripe, repository
});
assert.equal(retry.action, "mark_paid");
assert.deepEqual(steps, ["snapshot", "provider", "transaction"]);
console.log("PASS: real SDK signed webhook retries successfully after transient provider outage");

