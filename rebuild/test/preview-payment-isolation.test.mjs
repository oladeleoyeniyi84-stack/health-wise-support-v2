import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createPreviewServer } from "../src/server.mjs";
import { processSignedSandboxReconciliation } from "../src/integrations/signed-reconciliation.mjs";

test("preview server has no payment provider or legacy webhook imports",async()=>{
  const source=await readFile(new URL("../src/server.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(source,/stripe-webhook|signed-reconciliation|payment-reconciliation|createEventRepository|createSandboxCheckout/);
});
test("preview webhook and checkout routes fail closed without provider calls",async()=>{
  const server=createPreviewServer();
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{
    const port=server.address().port;
    for(const path of ["/api/stripe/webhook","/api/webhooks/stripe","/api/checkout","/checkout/return","/book"]){
      const response=await fetch("http://127.0.0.1:"+port+path,{method:"POST",body:"synthetic-not-signed"});
      assert.equal(response.status,503,path);
      assert.equal((await response.json()).error,"feature_not_released");
    }
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test("preferred signed boundary rejects invalid signature before repository access",async()=>{
  let called=false;
  const stripe={webhooks:{constructEvent(){throw new Error("signature mismatch");}}};
  const repository={async findOrderBySession(){called=true;throw new Error("unexpected");},async transaction(){called=true;throw new Error("unexpected");}};
  await assert.rejects(processSignedSandboxReconciliation({
    rawBody:Buffer.from("{}"),signature:"invalid",endpointSecret:"whsec_testOnly",
    stripe,repository
  }),/invalid_webhook_signature/);
  assert.equal(called,false);
});
test("preferred signed boundary rejects oversized body before provider or database",async()=>{
  let called=false;
  const stripe={webhooks:{constructEvent(){called=true;throw new Error("unexpected");}}};
  await assert.rejects(processSignedSandboxReconciliation({
    rawBody:Buffer.alloc(262145),signature:"invalid",endpointSecret:"whsec_testOnly",
    stripe,repository:{}
  }),/invalid_raw_body/);
  assert.equal(called,false);
});
