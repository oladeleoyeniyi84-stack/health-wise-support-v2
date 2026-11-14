import test from "node:test";
import assert from "node:assert/strict";
import { assertFreshPreparedSandboxAttempt } from "../src/integrations/stripe-v2-prepared-attempt-age.mjs";

const now=new Date("2026-11-14T18:00:00.000Z");
test("fresh journal age may be inspected but never authorizes Checkout creation",()=>{
  assert.equal(assertFreshPreparedSandboxAttempt({createdAt:new Date(now.getTime()-1000),now}),true);
  assert.equal(assertFreshPreparedSandboxAttempt({createdAt:now.toISOString(),now}),true);
});
test("stale, malformed and materially future-dated prepared attempts require review",()=>{
  for(const createdAt of [
    new Date(now.getTime()-900000),new Date(now.getTime()-3600000),
    new Date(now.getTime()+5001),"not-a-date",null,undefined,0,{}
  ]){
    assert.throws(()=>assertFreshPreparedSandboxAttempt({createdAt,now}),/checkout_attempt_requires_review/);
  }
});
test("modest five-second database clock skew is tolerated at the boundary",()=>{
  assert.equal(assertFreshPreparedSandboxAttempt({createdAt:new Date(now.getTime()+5000),now}),true);
});
test("invalid clocks and unsafe windows fail before any eligibility decision",()=>{
  for(const config of [{now:new Date("bad")},{now:"2026-11-14"},{maxAgeMs:0},{maxAgeMs:900001},{maxAgeMs:1.2}]){
    assert.throws(()=>assertFreshPreparedSandboxAttempt({createdAt:now,now,...config}),/invalid_attempt_clock/);
  }
});
