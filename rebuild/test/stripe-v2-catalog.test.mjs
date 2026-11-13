import test from "node:test";
import assert from "node:assert/strict";
import { HEALTHWISE_V2_SANDBOX_ACCOUNT, HEALTHWISE_V2_SANDBOX_CATALOG, getVerifiedV2SandboxSelection } from "../src/integrations/stripe-v2-catalog.mjs";

test("v2 catalog contains distinct verified inactive sandbox Price IDs", () => {
  const expected = [
    ["quick", "prod_VcgIQdrdphLJU9", "price_1UbQvoDSAM5aSpF4YcfIcscG", 4900, 15],
    ["full", "prod_VcgIqoyCE8gQNR", "price_1UbQvsDSAM5aSpF4dFOKCuVl", 9900, 30],
    ["premium", "prod_VcgITi8YWKS3TB", "price_1UbQvvDSAM5aSpF4cBcYrDI8", 19900, 60]
  ];
  assert.deepEqual(Object.keys(HEALTHWISE_V2_SANDBOX_CATALOG).sort(), expected.map(([tier])=>tier).sort());
  for (const [tier,productId,priceId,amountCents,durationMinutes] of expected) {
    const item = getVerifiedV2SandboxSelection({tier,stripeAccountId:HEALTHWISE_V2_SANDBOX_ACCOUNT,livemode:false});
    assert.equal(item.productId,productId);
    assert.equal(item.priceId,priceId);
    assert.equal(item.amountCents,amountCents);
    assert.equal(item.durationMinutes,durationMinutes);
    assert.equal(item.currency,"usd");
    assert.ok(Object.isFrozen(item));
  }
  assert.equal(new Set(expected.map(([,p])=>p)).size,3);
  assert.equal(new Set(expected.map(([, ,price])=>price)).size,3);
});
test("v2 catalog fails closed on live mode, missing account or other sandbox", () => {
  for (const args of [
    {tier:"quick",stripeAccountId:HEALTHWISE_V2_SANDBOX_ACCOUNT,livemode:true},
    {tier:"quick",stripeAccountId:"acct_other",livemode:false},
    {tier:"quick",livemode:false},
    {tier:"quick",stripeAccountId:HEALTHWISE_V2_SANDBOX_ACCOUNT}
  ]) assert.throws(()=>getVerifiedV2SandboxSelection(args),/stripe_sandbox_account_mismatch/);
});
test("v2 catalog rejects unknown keys and prototype property access", () => {
  for(const tier of ["legacy","__proto__","constructor","toString",""]) {
    assert.throws(()=>getVerifiedV2SandboxSelection({tier,stripeAccountId:HEALTHWISE_V2_SANDBOX_ACCOUNT,livemode:false}),/unknown_v2_tier/);
  }
});
