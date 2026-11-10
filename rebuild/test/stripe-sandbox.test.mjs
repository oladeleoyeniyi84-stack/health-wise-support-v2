import test from "node:test";
import assert from "node:assert/strict";
import { createSandboxCheckout } from "../src/integrations/stripe-sandbox.mjs";
const order = { id:"order_1", userId:"user_1", consultationKey:"quick", status:"pending" };
const selection = { userId:"user_1", consultationKey:"quick", stripePriceId:"price_Abc123", idempotencyKey:"test_idempotency_123" };
function mock() {
  const calls=[];
  const stripe={healthwiseVerifiedTestMode:true,checkout:{sessions:{create:async (...args)=>{calls.push(args);return {id:"cs_test_abc",url:"https://checkout.stripe.com/c/pay/cs_test_abc"};}}}};
  return {stripe,calls};
}
test("rejects absent Stripe client",async()=>await assert.rejects(createSandboxCheckout({order,selection,origin:"https://example.com"}),/stripe_client_required/));
test("requires explicit sandbox verification",async()=>{const {stripe}=mock();stripe.healthwiseVerifiedTestMode=false;await assert.rejects(createSandboxCheckout({stripe,order,selection,origin:"https://example.com"}),/test_mode_not_verified/);});
test("rejects cross-account selection",async()=>{const {stripe}=mock();await assert.rejects(createSandboxCheckout({stripe,order,selection:{...selection,userId:"other"},origin:"https://example.com"}),/invalid_selection/);});
test("rejects nonpending order",async()=>{const {stripe}=mock();await assert.rejects(createSandboxCheckout({stripe,order:{...order,status:"paid"},selection,origin:"https://example.com"}),/order_not_pending/);});
test("rejects non-HTTPS return origin",async()=>{const {stripe}=mock();await assert.rejects(createSandboxCheckout({stripe,order,selection,origin:"http://example.com"}),/invalid_origin/);});
test("passes fixed checkout parameters and idempotency key",async()=>{const {stripe,calls}=mock();const r=await createSandboxCheckout({stripe,order,selection,origin:"https://example.com"});assert.equal(r.sessionId,"cs_test_abc");assert.equal(calls[0][0].client_reference_id,"user_1");assert.equal(calls[0][0].line_items[0].price,"price_Abc123");assert.equal(calls[0][1].idempotencyKey,selection.idempotencyKey);});
test("rejects non-test checkout session",async()=>{const {stripe}=mock();stripe.checkout.sessions.create=async()=>({id:"cs_live_bad"});await assert.rejects(createSandboxCheckout({stripe,order,selection,origin:"https://example.com"}),/non_test_session_rejected/);});
