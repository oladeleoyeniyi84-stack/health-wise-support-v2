import test from "node:test";
import assert from "node:assert/strict";
import { verifyV2SandboxCheckoutPrice } from "../src/integrations/stripe-v2-price-preflight.mjs";
import { HEALTHWISE_V2_SANDBOX_ACCOUNT, HEALTHWISE_V2_SANDBOX_CATALOG } from "../src/integrations/stripe-v2-catalog.mjs";

const accountId = HEALTHWISE_V2_SANDBOX_ACCOUNT;
function mock(tier="quick", overrides={}) {
  const expected=HEALTHWISE_V2_SANDBOX_CATALOG[tier];
  const calls=[];
  const price={id:expected.priceId,livemode:false,currency:expected.currency,type:"one_time",unit_amount:expected.amountCents,product:expected.productId,active:false,metadata:{app:"healthwise-v2",tier},...overrides.price};
  const product={id:expected.productId,livemode:false,active:false,metadata:{app:"healthwise-v2",tier},...overrides.product};
  const stripe={
    healthwiseVerifiedTestMode:true,
    healthwiseVerifiedAccountId:accountId,
    prices:{retrieve:async id=>{calls.push(["price",id]);return price;}},
    products:{retrieve:async id=>{calls.push(["product",id]);return product;}}
  };
  Object.assign(stripe,overrides.client);
  return {stripe,calls};
}
const args=(stripe,tier="quick")=>({stripe,tier,stripeAccountId:accountId,livemode:false});

test("new v2 prices and products remain ineligible while inactive",async()=>{
  for(const tier of ["quick","full","premium"]){
    const {stripe,calls}=mock(tier);
    await assert.rejects(verifyV2SandboxCheckoutPrice(args(stripe,tier)),/v2_catalog_inactive/);
    assert.deepEqual(calls,[["price",HEALTHWISE_V2_SANDBOX_CATALOG[tier].priceId],["product",HEALTHWISE_V2_SANDBOX_CATALOG[tier].productId]]);
  }
});
test("preflight refuses mismatched account before provider access",async()=>{
  const {stripe,calls}=mock();
  await assert.rejects(verifyV2SandboxCheckoutPrice({...args(stripe),stripeAccountId:"acct_other"}),/stripe_sandbox_account_mismatch/);
  await assert.rejects(verifyV2SandboxCheckoutPrice({...args(stripe),livemode:true}),/stripe_sandbox_account_mismatch/);
  stripe.healthwiseVerifiedAccountId="acct_other";
  await assert.rejects(verifyV2SandboxCheckoutPrice(args(stripe)),/unverified_stripe_account/);
  assert.deepEqual(calls,[]);
});
test("preflight rejects price, product and metadata mismatch",async()=>{
  for(const overrides of [
    {price:{id:"price_wrong"}},
    {price:{unit_amount:900}},
    {price:{currency:"eur"}},
    {price:{livemode:true}},
    {price:{type:"recurring"}},
    {price:{product:"prod_legacy"}},
    {price:{metadata:{app:"legacy",tier:"quick"}}}
  ]){
    const {stripe}=mock("quick",overrides);
    await assert.rejects(verifyV2SandboxCheckoutPrice(args(stripe)),/v2_price_mismatch/);
  }
  for(const overrides of [
    {product:{id:"prod_legacy"}},
    {product:{livemode:true}},
    {product:{metadata:{app:"legacy",tier:"quick"}}}
  ]){
    const {stripe}=mock("quick",overrides);
    await assert.rejects(verifyV2SandboxCheckoutPrice(args(stripe)),/v2_product_mismatch/);
  }
});
test("preflight only produces selection when account, price and product checks pass",async()=>{
  const {stripe,calls}=mock("full",{price:{active:true},product:{active:true}});
  const result=await verifyV2SandboxCheckoutPrice(args(stripe,"full"));
  assert.deepEqual(result,{consultationKey:"full",stripePriceId:HEALTHWISE_V2_SANDBOX_CATALOG.full.priceId,amountCents:9900,currency:"usd"});
  assert.ok(Object.isFrozen(result));
  assert.equal(calls.length,2);
});
test("preflight cannot run with unverified or missing read-only client",async()=>{
  const {stripe,calls}=mock();
  stripe.healthwiseVerifiedTestMode=false;
  await assert.rejects(verifyV2SandboxCheckoutPrice(args(stripe)),/unverified_stripe_account/);
  stripe.healthwiseVerifiedTestMode=true;
  delete stripe.products;
  await assert.rejects(verifyV2SandboxCheckoutPrice(args(stripe)),/stripe_readonly_client_required/);
  assert.deepEqual(calls,[]);
});
