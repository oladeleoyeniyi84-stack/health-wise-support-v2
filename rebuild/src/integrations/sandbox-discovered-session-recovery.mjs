import { discoverOrphanV2SandboxSession } from "./sandbox-orphan-discovery.mjs";
import { recoverKnownV2SandboxSession } from "./sandbox-known-session-recovery.mjs";

/**
 * Engineering-only recovery of a lost Checkout session ID.
 *
 * Stripe listing is an untrusted discovery hint, NEVER an authorization to
 * create a replacement Checkout or to grant an entitlement. A uniquely
 * discovered candidate goes through the independent account/session/line-item
 * verifier and the locked PostgreSQL transaction in known-session recovery.
 * No live payments, Stripe mutations, web routes, or timers.
 */
export async function recoverDiscoveredV2SandboxSession({
  stripe, pool, orderId, now = new Date(), maxPages = 3
}) {
  if (typeof pool?.query !== "function" || typeof pool?.connect !== "function") {
    throw new Error("recovery_pool_required");
  }
  // Both helpers validate the order ID. No payments or writes on the discovery path.
  const discovery = await discoverOrphanV2SandboxSession({
    stripe, pool, orderId, now, maxPages
  });
  if (discovery.action !== "candidate_verified") {
    // Fail closed for no-match, duplicate, truncated or aged searches.
    if (discovery.action !== "manual_review") {
      throw new Error("unexpected_discovery_outcome");
    }
    return discovery;
  }
  if (discovery.orderId !== orderId ||
      typeof discovery.sessionId !== "string" ||
      !/^cs_test_[A-Za-z0-9]+$/.test(discovery.sessionId)) {
    throw new Error("untrusted_discovery_result");
  }
  // Discovery is not a settlement signal. Known-session recovery repeats
  // authenticated Stripe checks and re-reads the database before binding.
  return recoverKnownV2SandboxSession({
    stripe, pool, orderId, sessionId: discovery.sessionId
  });
}
