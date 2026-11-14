import test from "node:test";
import assert from "node:assert/strict";
import { assessIsolatedV2WebhookConfig } from "../src/integrations/stripe-v2-webhook-host-readiness.mjs";
import { HEALTHWISE_V2_SANDBOX_ACCOUNT } from "../src/integrations/stripe-v2-catalog.mjs";

const secret="whsec_SyntheticFixtureOnly_1234567890";
const complete={
  endpointUrl:"https://sandbox-hooks.example.net/sandbox/webhook",
  stripeAccountId:HEALTHWISE_V2_SANDBOX_ACCOUNT,livemode:false,
  webhookSecret:secret,secretSource:"managed-secret-store",
  tlsManaged:true,dedicatedHost:true,
  reverseProxyBodyLimitBytes:262144,ingressRateLimit:true,
  persistentEventStore:true,monitoringConfigured:true
};
test("complete declared isolated HTTPS configuration returns readiness only, never release approval",()=>{
 const result=assessIsolatedV2WebhookConfig(complete);
 assert.deepEqual(result,{ready:true,blockers:[],mode:"sandbox-readiness-only",checkoutEnabled:false,release:"blocked"});
 assert.ok(Object.isFrozen(result));
 assert.ok(Object.isFrozen(result.blockers));
 assert.ok(!JSON.stringify(result).includes(secret));
});
test("missing environment, secret, TLS and operational controls fail closed",()=>{
 const result=assessIsolatedV2WebhookConfig();
 assert.equal(result.ready,false);
 for(const code of [
  "endpoint_url_required","sandbox_account_required","isolated_signing_secret_required",
  "managed_secret_store_required","dedicated_tls_host_required","edge_body_limit_required",
  "edge_rate_limit_required","durable_event_store_required","monitoring_required"
 ])assert.ok(result.blockers.includes(code),code);
});
test("live, cross-account, wrong signing secret and unprotected secret source are rejected",()=>{
 for(const changed of [
  {stripeAccountId:"acct_wrong"},{livemode:true},
  {webhookSecret:"sk_test_wrong_kind"},
  {webhookSecret:"whsec_short"},
  {secretSource:"source-file"}
 ]){
  const result=assessIsolatedV2WebhookConfig({...complete,...changed});
  assert.equal(result.ready,false);
  assert.equal(result.checkoutEnabled,false);
 }
});
test("public site, legacy Replit, local and weak endpoint URLs are excluded",()=>{
 for(const endpointUrl of [
  "http://sandbox-hooks.example.net/sandbox/webhook",
  "https://healthwisesupport.com/sandbox/webhook",
  "https://hooks.elevate360official.com/sandbox/webhook",
  "https://legacy.replit.dev/sandbox/webhook",
  "http://127.0.0.1/sandbox/webhook",
  "https://localhost/sandbox/webhook",
  "https://sandbox-hooks.example.net:8443/sandbox/webhook",
  "https://user:pass@sandbox-hooks.example.net/sandbox/webhook",
  "https://sandbox-hooks.example.net/api/stripe/webhook",
  "https://sandbox-hooks.example.net/sandbox/webhook?secret=test"
 ]){
  const result=assessIsolatedV2WebhookConfig({...complete,endpointUrl});
  assert.equal(result.ready,false,endpointUrl);
  assert.equal(result.release,"blocked");
 }
});
test("unbounded proxy body and missing rate limits cannot pass readiness",()=>{
 for(const changed of [
  {reverseProxyBodyLimitBytes:262145},{reverseProxyBodyLimitBytes:0},
  {reverseProxyBodyLimitBytes:"262144"},{ingressRateLimit:false},
  {monitoringConfigured:false},{dedicatedHost:false},{tlsManaged:false}
 ]){
  const result=assessIsolatedV2WebhookConfig({...complete,...changed});
  assert.equal(result.ready,false);
 }
});
