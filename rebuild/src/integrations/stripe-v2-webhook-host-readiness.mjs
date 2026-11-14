import { HEALTHWISE_V2_SANDBOX_ACCOUNT } from "./stripe-v2-catalog.mjs";

/**
 * Pure, read-only configuration readiness check for a future dedicated
 * Stripe TEST-mode HTTPS webhook. Never starts a server or changes Stripe.
 * Called with server-owned configuration, never with untrusted request input.
 */
export function assessIsolatedV2WebhookConfig({
  endpointUrl, stripeAccountId, livemode, webhookSecret,
  secretSource, tlsManaged, reverseProxyBodyLimitBytes,
  ingressRateLimit, dedicatedHost, persistentEventStore,
  monitoringConfigured
}={}) {
  const blockers=[];
  let url;
  try { url=new URL(endpointUrl); }
  catch { blockers.push("endpoint_url_required"); }
  if(url) {
    const host=url.hostname.toLowerCase();
    if(url.protocol!=="https:" || url.username || url.password ||
       url.port || url.search || url.hash || url.pathname!=="/sandbox/webhook")
      blockers.push("dedicated_https_endpoint_required");
    if(!host.includes(".") || host==="localhost" ||
       host.endsWith(".localhost") || host==="127.0.0.1" ||
       host==="::1" || host.endsWith(".replit.dev") ||
       host.endsWith(".repl.co") || host.endsWith(".elevate360official.com") ||
       host==="elevate360official.com" || host.endsWith(".healthwisesupport.com") ||
       host==="healthwisesupport.com")
      blockers.push("isolated_host_required");
  }
  if(stripeAccountId!==HEALTHWISE_V2_SANDBOX_ACCOUNT || livemode!==false)
    blockers.push("sandbox_account_required");
  if(typeof webhookSecret!=="string" || !/^whsec_[A-Za-z0-9_+-]{24,}$/.test(webhookSecret))
    blockers.push("isolated_signing_secret_required");
  if(secretSource!=="managed-secret-store")
    blockers.push("managed_secret_store_required");
  if(tlsManaged!==true || dedicatedHost!==true)
    blockers.push("dedicated_tls_host_required");
  if(!Number.isSafeInteger(reverseProxyBodyLimitBytes) ||
     reverseProxyBodyLimitBytes<1 || reverseProxyBodyLimitBytes>262144)
    blockers.push("edge_body_limit_required");
  if(ingressRateLimit!==true)
    blockers.push("edge_rate_limit_required");
  if(persistentEventStore!==true)
    blockers.push("durable_event_store_required");
  if(monitoringConfigured!==true)
    blockers.push("monitoring_required");

  // No secrets or customer identifiers are returned or logged.
  return Object.freeze({
    ready:blockers.length===0,
    blockers:Object.freeze(blockers),
    mode:"sandbox-readiness-only",
    checkoutEnabled:false,
    release:"blocked"
  });
}
