import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

const workflow = new URL("../../.github/workflows/healthwise-stripe-testmode-manual.yml", import.meta.url);
test("Stripe manual workflow has no automatic trigger or provider secrets",async()=>{
  const yaml=await readFile(workflow,"utf8");
  assert.match(yaml,/^on:\s*\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(yaml,/^\s+(?:push|pull_request|schedule|repository_dispatch|workflow_run):/m);
  assert.match(yaml,/acknowledge_test_only/);
  assert.match(yaml,/TEST_ONLY_NO_PROVIDER_CALLS/);
  assert.match(yaml,/^permissions:\s*\n\s+contents: read/m);
  assert.doesNotMatch(yaml,/\$\{\{\s*secrets\./);
  assert.doesNotMatch(yaml,/\b(?:curl|wget)\b.*(?:stripe\.com|api\.stripe\.com)/i);
  assert.doesNotMatch(yaml,/stripe\s+trigger|stripe\s+listen|stripe\s+checkout/i);
});
test("manual preflight only invokes dependency-free local test suite",async()=>{
  const yaml=await readFile(workflow,"utf8");
  assert.match(yaml,/run: npm test/);
  assert.doesNotMatch(yaml,/npm install|npm ci|npx |node test\/stripe-sdk-signature/);
  assert.match(yaml,/test -z "\$STRIPE_SECRET_KEY"/);
  assert.match(yaml,/test -z "\$STRIPE_WEBHOOK_SECRET"/);
});
