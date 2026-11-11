# Healthwise Payment Release Gate — 2026-11-11

**Engineering Vault: NO-GO.** Development branch only. No production merge, payment activation, or database migration is authorized by this document.

## Verified in GitHub Actions run #114 (commit 2fda10c5)
- 102 dependency-free unit tests passed (0 failed); all four jobs succeeded.
- PostgreSQL 16 disposable integration passed: migration, uniqueness, rollback/retry, guarded payment transition, duplicate webhook concurrency using the actual repository adapter.
- Official Stripe SDK offline signature test passed: signed synthetic event, payload tampering rejection, invalid signature rejection, and simulated provider outage followed by retry.
- Two distinct webhook event IDs for the same Checkout session resulted in one paid transition and one booking entitlement.
- Synthetic disposable PostgreSQL 16 backup and isolated restore passed, preserving rows, uniqueness constraints, and foreign keys. This is **not** a production recovery test.
- Legacy webhook module delegates to the preferred signed short-transaction reconciliation path; tests cover provider-outage retry and idempotent redelivery.

## Unverified / blocking
1. **Real Stripe test-mode API:** No authenticated checkout creation, retrieved session, line-item API response, or provider-delivered webhook has been tested against Stripe. The SDK tests use synthetic signed events and stubbed API calls.
2. **Production-grade webhook route:** The preferred `signed-reconciliation.mjs` is not mounted on an HTTP route. Confirm raw-byte body handling, signature header, request-size cap, non-2xx retry responses, timeouts, and observability before enabling any route.
3. **Legacy webhook migration:** The former in-transaction provider lookup implementation was retired. `src/integrations/stripe-webhook.mjs` now delegates to the preferred short-transaction signed path. The migration is covered by offline tests but remains **unverified with authenticated Stripe sandbox calls and an HTTP endpoint**.
4. **Provider credentials:** Test credentials must be provided only through a protected secret store, never committed to GitHub, logged, or copied into chat. Confirm a verified `sk_test_` credential and dedicated `whsec_` test endpoint before optional authenticated sandbox checks.
5. **Checkout persistence:** Confirm test-mode Checkout session creation, idempotency, order/session binding, and recoverability after partial failure.
6. **Real database recovery:** Dedicated app production backup/PITR, isolated restore rehearsal, migration safety, and rollback plan are not verified. Disposable CI database tests are not a substitute.
7. **Operational controls:** Verify retry monitoring, reconciliation of stuck/manual-review orders, refunds and disputes policy, alerting, least-privilege secrets, and failure injection.
8. **Release approval:** Founder must explicitly approve security-critical production configuration and deployment after all gates pass.

## Safe next sequence
1. Keep the draft PR and Engineering Vault restrictions.
2. Maintain regression tests enforcing that no payment webhook is wired into the preview HTTP server and that provider failures remain retryable in the preferred path.
3. Add a separate *opt-in* Stripe test-mode job requiring protected credentials, with no automatic run on pull requests from forks; do not run it until credentials and spend/side-effect policy are approved.
4. Review migration/backup/restore evidence and conduct end-to-end staging verification.
5. Seek explicit release approval only after verified evidence is recorded.

## Cost and environment constraints
Use existing GitHub Actions ephemeral runners and disposable PostgreSQL only. Do not use Replit. Do not provision paid infrastructure or run live-mode Stripe transactions. Avoid creating real Checkout sessions without an explicit test-mode execution authorization.
