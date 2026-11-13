import { processSignedSandboxReconciliation } from "./signed-reconciliation.mjs";

/**
 * Legacy compatibility export, engineering-only. The old implementation was
 * retired because it called Stripe while holding a database transaction and
 * consumed transient provider failures as manual-review events.
 *
 * All payment reconciliation now delegates to the preferred signed,
 * short-transaction path. Not connected to an HTTP route or production.
 */
export async function processSandboxWebhook(options) {
  return processSignedSandboxReconciliation(options);
}
