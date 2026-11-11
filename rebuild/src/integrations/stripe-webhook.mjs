import { processSignedSandboxReconciliation } from "./signed-reconciliation.mjs";

/**
 * Compatibility-only entrypoint for legacy engineering tests.
 * All execution delegates to the preferred short-transaction reconciliation path.
 * No Stripe provider lookup is performed inside this module or a DB transaction.
 * Not exposed as an HTTP endpoint; production release remains blocked.
 */
export async function processSandboxWebhook(options) {
  return processSignedSandboxReconciliation(options);
}
