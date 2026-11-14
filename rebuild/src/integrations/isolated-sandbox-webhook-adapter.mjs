import { processSignedSandboxReconciliation } from "./signed-reconciliation.mjs";

/**
 * Engineering-only HTTP request adapter. It does not create/listen on a server
 * and MUST NOT be mounted on preview/public routes.
 *
 * The caller is responsible for TLS, request streaming limits, admission rate
 * limits, trusted secrets and reliable Stripe delivery/retry configuration.
 * Only raw bytes (never parsed/re-serialized JSON) reach signature checking.
 */
export async function handleIsolatedSandboxWebhook({
  method, headers, rawBody, endpointSecret, stripe, repository
}) {
  const reply=(status, code)=>Object.freeze({
    status, headers:Object.freeze({"content-type":"application/json","cache-control":"no-store"}),
    body:Object.freeze({code})
  });
  if(method!=="POST")return reply(405,"method_not_allowed");
  const h=headers && typeof headers==="object" ? headers : {};
  const signature=h["stripe-signature"];
  const contentType=h["content-type"];
  if(typeof contentType!=="string" ||
      contentType.split(";")[0].trim().toLowerCase()!=="application/json")
    return reply(415,"unsupported_content_type");
  if(!Buffer.isBuffer(rawBody) || rawBody.length===0 || rawBody.length>262144)
    return reply(413,"invalid_body_size");
  if(typeof signature!=="string" || !signature || signature.length>8192)
    return reply(400,"invalid_signature");
  try {
    const result=await processSignedSandboxReconciliation({
      rawBody,signature,endpointSecret,stripe,repository
    });
    if(!["duplicate","mark_paid","manual_review","ignore"].includes(result?.action))
      return reply(503,"reconciliation_unavailable");
    return reply(200,"accepted");
  } catch(error) {
    if(["invalid_webhook_signature","sandbox_event_required",
         "sandbox_session_required"].includes(error?.message))
      return reply(400,"invalid_event");
    // Unknown order, temporary Stripe failures, database errors and missing
    // secret/configuration must retry rather than acknowledge and lose events.
    return reply(503,"reconciliation_unavailable");
  }
}
