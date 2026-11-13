import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("protected Stripe workflow remains manual, read-only and branch-scoped", async () => {
  const yaml = await readFile(new URL("../../.github/workflows/healthwise-stripe-protected-readiness.yml", import.meta.url), "utf8");
  assert.match(yaml, /workflow_dispatch:/);
  assert.match(yaml, /permissions:\s*\n\s*contents: read/);
  assert.match(yaml, /refs\/heads\/rebuild\/healthwise-foundation-20261110/);
  assert.match(yaml, /environment: healthwise-stripe-testmode/);
  assert.match(yaml, /secrets\.STRIPE_TEST_SECRET_KEY/);
  assert.match(yaml, /https:\/\/api\.stripe\.com\/v1\/balance/);
  assert.match(yaml, /response\.get\("livemode"\) is not False/);
  assert.doesNotMatch(yaml, /(?:api\.stripe\.com\/v1\/(?:checkout|charges|payment_intents)|stripe\s+checkout|checkout\.sessions\.create)/i);
  assert.doesNotMatch(yaml, /^\s*(?:push|pull_request|schedule):/m);
});
