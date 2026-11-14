import { createHmac } from "node:crypto";
import { prepareV2SandboxCheckoutAttempt } from "./stripe-v2-checkout-preparation.mjs";

/**
 * PRIVATE, engineering-only coordinator. No Stripe Checkout creation method,
 * webhook handler, or public route is imported. Only checks identity and
 * prepares a durable attempt; never returns a payment link or entitlement.
 *
 * resolvePrincipal MUST be an internal trusted authentication adapter, not
 * a callback populated from the HTTP body. The key is server-derived and
 * stable across retries for the same order in this isolated environment.
 */
export async function coordinateV2SandboxCheckoutPreparation({
  stripe, pool, orderId, resolvePrincipal, serverKeySecret
}) {
  if (typeof pool?.query !== "function" ||
      typeof resolvePrincipal !== "function") throw new Error("trusted_context_required");
  if (typeof orderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId))
    throw new Error("invalid_order_id");
  if (typeof serverKeySecret !== "string" || Buffer.byteLength(serverKeySecret,"utf8") < 32)
    throw new Error("server_secret_required");

  const principal = await resolvePrincipal();
  if (!principal || typeof principal.providerSubject !== "string" ||
      principal.providerSubject.length < 1 ||
      principal.providerSubject.length > 200 ||
      principal.authenticated !== true)
    throw new Error("authenticated_principal_required");

  // Authenticate ownership before any provider lookup or DB write. Schema
  // must forbid account reassignment before future Checkout creation.
  const found=await pool.query(
    `SELECT o.id, o.status, o.stripe_session_id, a.provider_subject
       FROM consultation_orders o
       JOIN accounts a ON a.id=o.account_id
      WHERE o.id=$1`,[orderId]
  );
  if (found.rowCount !== 1 || !found.rows?.[0] ||
      String(found.rows[0].id)!==orderId ||
      found.rows[0].provider_subject!==principal.providerSubject)
    throw new Error("checkout_owner_mismatch");
  if (found.rows[0].status!=="pending" ||
      found.rows[0].stripe_session_id != null)
    throw new Error("checkout_order_not_eligible");

  // Never let the requester supply idempotency keys. HMAC binds key to
  // this order under an isolated server secret without predictable output.
  const idempotencyKey="hwv2_"+createHmac("sha256",serverKeySecret)
    .update("healthwise-v2-test-only:checkout:"+orderId).digest("hex");
  const receipt=await prepareV2SandboxCheckoutAttempt({
    stripe,pool,orderId,idempotencyKey
  });
  if (receipt.action!=="prepared_only" || receipt.orderId!==orderId)
    throw new Error("checkout_preparation_failed");
  return Object.freeze({
    action:"prepared_only",orderId,
    consultationKey:receipt.consultationKey,
    amountCents:receipt.amountCents,currency:receipt.currency,
    // Deliberately omit the journal key from caller-facing receipt.
    release:"blocked"
  });
}
