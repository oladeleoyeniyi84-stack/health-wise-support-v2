# Healthwise v2 — discovery-to-atomic-recovery integration

**Engineering Vault: NO-GO. Development branch only, no Stripe writes.**

## Implemented
- `rebuild/src/integrations/sandbox-discovered-session-recovery.mjs` composes bounded read-only `discoverOrphanV2SandboxSession` with `recoverKnownV2SandboxSession`.
- Only a unique candidate found after the bounded Stripe listing completes may proceed. All manual-review results return without database mutations.
- The known-session path **re-reads stored order expectations** and rechecks authenticated Stripe account/test mode, Checkout session metadata, amount/currency and single matching line item before calling `bindRecoveredSandboxSession`.
- The atomic binding function holds locks on both order and journal rows, validates pending status, price and idempotency key, and updates both records in one transaction, rolling back on failure.
- `rebuild/test/sandbox-discovered-session-recovery.test.mjs` covers success, zero/duplicate/truncated listings, wrong account, changed provider response on the second verification, DB rollback, and stale/missing orders.

## Validation status
- GitHub commits have been saved, but the connector returned **no workflow-run or combined-status entries** for the latest commit; tests remain unverified by CI. Do not present these tests as passing until a current workflow is independently examined.
- No full disposable-PostgreSQL integration test of the combined discovery path was added in this checkpoint. Existing disposable DB tests cover the known-session path and atomic database updates independently.

## Security limitations
- Discovery scans only bounded Stripe Checkout Sessions pages and a 24h journal-age window. Zero matches or incomplete scans must **never** permit re-creation with a fresh idempotency key.
- The provider SDK must be trusted; this code uses authenticated read-only Stripe account and balance endpoints.
- A verified Checkout session is **not proof of settled payment**, and no entitlement is granted.
- No public HTTP endpoint invokes recovery and no scheduled recovery job was enabled.
- Product/Price IDs remain inactive; Replit webhook remains disabled; production backup/PITR, signed webhook verification, complete provider-failure recovery, release approval and CI evidence remain blockers.
