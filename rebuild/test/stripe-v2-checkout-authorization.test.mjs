import test from "node:test";
import assert from "node:assert/strict";
import { authorizeV2SandboxCheckoutPreflight } from "../src/integrations/stripe-v2-checkout-authorization.mjs";
import { HEALTHWISE_V2_SANDBOX_ACCOUNT, HEALTHWISE_V2_SANDBOX_CATALOG } from "../src/integrations/stripe-v2-catalog.mjs";

const accountId=HEALTHWISE_V2_SANDBOX_ACCOUNT;
const item=HEALTHWISE_V2_SANDBOX_CATALOG.quick;
function fixture({actualAccount=accountId,livemode=false,priceActive=false,productActive=false,pricePatch={},productPatch={}}={}){
  const calls=[];
  const stripe={
    // A caller-provided flag must not substitute for authenticated reads.
    healthwiseVerifiedTestMode:true,
    healthwiseVerifiedAccountId:accountId,
    accounts:{retrieve:async()=>{calls.push("account");return {object:"account",id:actualAccount};}},
    balance:{retrieve:async()=>{calls.push("balance");return {object:"balance",livemode};}},
    prices:{retrieve:async id=>{
      calls.push("price");
      return {id,livemode:false,active:priceActive,type:"one_time",product:item.productId,
        unit_amount:item.amountCents,currency:"usd",metadata:{app:"healthwise-v2",tier:"quick"},...pricePatch};
    }},
    products:{retrieve:async id=>{
      calls.push("product");
      return {id,livemode:false,active:productActive,metadata:{app:"healthwise-v2",tier:"quick"},...productPatch};
    }}
  };
  return {stripe,calls};
}
test("inactive Healthwise v2 catalog refuses Checkout authorization without any Stripe writes",async()=>{
  const f=fixture();
  await assert.rejects(authorizeV2SandboxCheckoutPreflight({stripe:f.stripe,tier:"quick"}),/v2_catalog_inactive/);
  assert.deepEqual(f.calls,["account","balance","price","product"]);
});
test("wrong account and live-mode balance reject before price access",async()=>{
  const a=fixture({actualAccount:"acct_wrong"});
  await assert.rejects(authorizeV2SandboxCheckoutPreflight({stripe:a.stripe,tier:"quick"}),/stripe_sandbox_account_mismatch/);
  assert.deepEqual(a.calls,["account"]);
  const b=fixture({livemode:true});
  await assert.rejects(authorizeV2SandboxCheckoutPreflight({stripe:b.stripe,tier:"quick"}),/stripe_test_mode_required/);
  assert.deepEqual(b.calls,["account","balance"]);
});
test("legacy price, mismatched amount and unverified product reject",async()=>{
  for(const change of [
    {pricePatch:{id:"price_legacy"}},
    {pricePatch:{unit_amount:1234}},
    {pricePatch:{metadata:{app:"legacy",tier:"quick"}}},
    {productPatch:{id:"prod_legacy"}}
  ]){
    const f=fixture(change);
    await assert.rejects(authorizeV2SandboxCheckoutPreflight({stripe:f.stripe,tier:"quick"}),/v2_(price|product)_mismatch/);
  }
});
test("read-only preflight selection only returns when both sandbox objects are active",async()=>{
  const f=fixture({priceActive:true,productActive:true});
  const selection=await authorizeV2SandboxCheckoutPreflight({stripe:f.stripe,tier:"quick"});
  assert.deepEqual(selection,{consultationKey:"quick",stripePriceId:item.priceId,amountCents:4900,currency:"usd"});
  assert.ok(Object.isFrozen(selection));
  assert.deepEqual(f.calls,["account","balance","price","product"]);
});
test("missing trusted provider API does not permit flag-only validation",async()=>{
  const f=fixture();
  delete f.stripe.accounts;
  await assert.rejects(authorizeV2SandboxCheckoutPreflight({stripe:f.stripe,tier:"quick"}),/stripe_readonly_client_required/);
  assert.deepEqual(f.calls,[]);
});
