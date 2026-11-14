# Healthwise v2 — Immutable full Checkout request and redirect URL fingerprint

**2026-11-14 | Engineering Vault NO-GO | No new infrastructure expense**

## Verified baseline
User screenshot showed GitHub Actions run #300 green at commit `ed29eff`, after correction of the attacker-origin regression fixture. This latest work is newer and must be verified separately.

## Scope implemented
- `rebuild/src/integrations/stripe-v2-full-request-fingerprint.mjs` derives a SHA-256 fingerprint of the COMPLETE blocked Checkout parameter preview: canonical base snapshot hash, mode, exact pinned Price ID, quantity, owner reference, order/tier metadata, exact **success and cancel URLs**, and the immutable journal idempotency option.
- The input must match the existing verified v2 base snapshot and the supplied approved HTTPS return origin. This trusted server-side approved origin is a future configuration dependency; a browser must never be allowed to supply the approval value.
- `rebuild/db/005_checkout_full_request_fingerprint.sql` defines a separate one-row-per-order design-only immutable table containing the base snapshot hash, full request hash and exact redirect URLs, with UPDATE/DELETE prohibited by a trigger.
- Persist uses conditional INSERT requiring a pending order, matching owner/money/tier, matching prepared journal, and matching base snapshot. Same-request retries require all those conditions plus an exact persisted hash and exact URLs. New or modified redirect URLs do NOT overwrite the original record.
- Added `rebuild/test/stripe-v2-full-request-fingerprint.test.mjs` and `rebuild/test/postgres-v2-full-request-fingerprint.mjs`. Tests use synthetic IDs, no external Stripe SDK calls, and disposable PostgreSQL schemas applying only design migrations 001–005. They test redirect changes, forged origin, duplicate replays, failed mutation, and changed monetary terms.
- Extended existing GitHub Actions `postgres-integration` job to execute the disposable full-request test.

## Non-authorizations and remaining design gaps
- This layer is NOT wired into Stripe Checkout creation, the private preparation coordinator or the public preview server. There is no provider write, no Stripe endpoint change, no price activation, no hosted webhook, and no deployment.
- The earlier base snapshot remains immutable; the separate full-request table ensures exact redirect URLs cannot be changed once bound. A request's hash alone does NOT prove the request has never been sent to Stripe or establish that an uncertain provider result is safe to retry.
- For an eventual provider operation, require authenticated account/owner verification, locked state, saved full-request fingerprint with trusted server-approved origin, bounded provider idempotency/timeout handling, read-only provider reconciliation before retries, protected isolated endpoint and explicit founder authorization.
- Review production migration + rollback and backup/PITR isolated restore before any persistent DB change. No migration was applied beyond disposable CI tests.

## Verification
The latest exact branch commit must pass all four CI jobs before this gate is certified. Last known green #300 does not certify new changes.

**Decision: continue isolated build/testing only; Engineering Vault remains NO-GO.**
