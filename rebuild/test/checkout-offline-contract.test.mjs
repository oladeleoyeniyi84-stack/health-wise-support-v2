import test from "node:test";
import assert from "node:assert/strict";
import { createSandboxCheckout } from "../src/integrations/stripe-sandbox.mjs";

const order = { id:"order_123", userId:"user_123", consultationKey:"quick", status:"pending", stripeSessionId:null };
const selection = { userId:"user_123", consultationKey:"quick", stripePriceId:"price_Test123", idempotencyKey:"sandbox_checkout_attempt_123456" };
function client(result={id:"cs_test_123",url:"https://checkout.stripe.com/c/pay/cs_test_123"}) {
  const calls=[];
  const stripe={healthwiseVerifiedTestMode:true,checkout:{sessions:{create:async (...args)=>{calls.push(args);return result;}}}};
  return {stripe,calls};
}
test("offline checkout contract pins test-only session, one item and return routes",async()=>{
  const {stripe,calls}=client();
  const response=await createSandboxCheckout({stripe,order,selection,origin:"https://example.org"});
  assert.deepEqual(response,{sessionId:"cs_test_123",checkoutUrl:"https://checkout.stripe.com/c/pay/cs_test_123"});
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0][0],{
    mode:"payment",
    line_items:[{price:"price_Test123",quantity:1}],
    client_reference_id:"user_123",
    metadata:{orderId:"order_123",consultationKey:"quick"},
    success_url:"https://example.org/checkout/return?session_id={CHECKOUT_SESSION_ID}",
    cancel_url:"https://example.org/consultations"
  });
  assert.deepEqual(calls[0][1],{idempotencyKey:selection.idempotencyKey});
});
test("invalid selection and already-bound orders cannot call provider",async()=>{
  const {stripe,calls}=client();
  await assert.rejects(createSandboxCheckout({stripe,order,selection:{...selection,stripePriceId:"price_live!bad"},origin:"https://example.org"}),/invalid_selection/);
  await assert.rejects(createSandboxCheckout({stripe,order:{...order,stripeSessionId:"cs_test_existing"},selection,origin:"https://example.org"}),/order_not_pending/);
  await assert.rejects(createSandboxCheckout({stripe,order,selection:{...selection,idempotencyKey:"short"},origin:"https://example.org"}),/invalid_idempotency_key/);
  assert.equal(calls.length,0);
});
test("unverified test-mode status cannot call provider",async()=>{
  const {stripe,calls}=client();
  stripe.healthwiseVerifiedTestMode=false;
  await assert.rejects(createSandboxCheckout({stripe,order,selection,origin:"https://example.org"}),/test_mode_not_verified/);
  assert.equal(calls.length,0);
});
