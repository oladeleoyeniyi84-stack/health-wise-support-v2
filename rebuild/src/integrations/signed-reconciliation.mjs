import { reconcileSandboxPayment } from "./payment-reconciliation.mjs";

/**
 * Preferred engineering-only signed webhook boundary.
 * Verifies raw body before invoking the short-transaction reconciliation path.
 * Never exposed by preview server; no SDK/client is instantiated here.
 */
export async function processSignedSandboxReconciliation({ rawBody, signature, endpointSecret, stripe, repository }) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || rawBody.length > 262144) throw new Error("invalid_raw_body");
  if (typeof signature !== "string" || !signature || typeof endpointSecret !== "string" || !endpointSecret.startsWith("whsec_")) throw new Error("webhook_configuration_required");
  if (typeof stripe?.webhooks?.constructEvent !== "function") throw new Error("stripe_verifier_required");
  let event;
  try { event = stripe.webhooks.constructEvent(rawBody, signature, endpointSecret); }
  catch { throw new Error("invalid_webhook_signature"); }
  if (!event || event.livemode !== false || !/^evt_[A-Za-z0-9]+$/.test(event.id ?? "")) throw new Error("sandbox_event_required");
  return reconcileSandboxPayment({ event, stripe, repository });
}
