import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL(path,import.meta.url),"utf8");

test("production-facing preview does not expose Stripe integration imports",async()=>{
  const server=await read("../src/server.mjs");
  assert.doesNotMatch(server,/from\s+["'][^"']*(?:stripe-webhook|signed-reconciliation|stripe-sandbox|payment-reconciliation|postgres-events)/);
});
test("legacy webhook must never be wired to an HTTP entrypoint",async()=>{
  const server=await read("../src/server.mjs");
  assert.doesNotMatch(server,/stripe-webhook\.mjs|processSandboxWebhook|processStripeWebhook/);
  const docs=await read("../docs/payment-release-gate-20261111.md");
  assert.match(docs,/legacy/i);
  assert.match(docs,/transaction/i);
});
test("checkout and booking endpoints remain explicitly unavailable",async()=>{
  const server=await read("../src/server.mjs");
  assert.match(server,/feature_not_released/);
  assert.match(server,/res\.writeHead\(503\)/);
  assert.doesNotMatch(server,/stripe\.checkout\.sessions\.create|checkout\.sessions\.create/);
});
