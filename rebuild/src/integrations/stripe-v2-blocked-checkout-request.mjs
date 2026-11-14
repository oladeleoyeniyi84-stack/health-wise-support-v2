import { makeV2CheckoutRequestSnapshot } from "./stripe-v2-request-snapshot.mjs";

/**
 * Engineering-only Stripe Checkout request preview. No Stripe SDK, HTTP
 * client, database write, secret, or session creation is used.
 *
 * This does NOT authorize a provider call. Redirect origin is separately
 * approved server configuration and must be added to a durable request
 * fingerprint before any future provider-write coordinator is enabled.
 */
export function buildBlockedV2CheckoutRequest({
  snapshot, returnOrigin, approvedReturnOrigin
}) {
  if(!snapshot?.terms || typeof snapshot.sha256!=="string")
    throw new Error("checkout_snapshot_required");
  const t=snapshot.terms;
  const rebuilt=makeV2CheckoutRequestSnapshot({
    orderId:t.orderId,ownerSubject:t.ownerSubject,
    tier:t.tier,idempotencyKey:t.idempotencyKey
  });
  if(rebuilt.sha256!==snapshot.sha256 ||
     JSON.stringify(rebuilt.terms)!==JSON.stringify(t))
    throw new Error("checkout_snapshot_integrity_mismatch");
  if(typeof returnOrigin!=="string" ||
     typeof approvedReturnOrigin!=="string" ||
     returnOrigin!==approvedReturnOrigin)
    throw new Error("checkout_origin_not_approved");
  let url;
  try { url=new URL(returnOrigin); } catch {
    throw new Error("checkout_origin_not_approved");
  }
  if(url.protocol!=="https:" || !url.hostname.includes(".") ||
     url.username || url.password || url.port || url.search || url.hash ||
     url.pathname!=="/" || url.hostname==="localhost" ||
     url.hostname.endsWith(".replit.dev") ||
     url.hostname.endsWith(".repl.co"))
    throw new Error("checkout_origin_not_approved");
  // Canonical HTTPS origin only. No caller-injected paths or query values.
  if(returnOrigin!==url.origin)
    throw new Error("checkout_origin_not_approved");
  const params=Object.freeze({
    mode:"payment",
    line_items:Object.freeze([Object.freeze({
      price:t.stripePriceId,quantity:1
    })]),
    client_reference_id:t.ownerSubject,
    metadata:Object.freeze({
      orderId:t.orderId,consultationKey:t.tier
    }),
    success_url:returnOrigin+"/checkout/return?session_id={CHECKOUT_SESSION_ID}",
    cancel_url:returnOrigin+"/consultations"
  });
  const options=Object.freeze({idempotencyKey:t.idempotencyKey});
  return Object.freeze({
    action:"blocked_request_preview",
    snapshotSha256:rebuilt.sha256,params,options,
    providerWriteAuthorized:false,release:"blocked"
  });
}
