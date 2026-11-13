# Healthwise Payment Release Gate — 2026-11-11

**Engineering Vault: NO-GO.** Development branch only. No production merge, payment activation, or database migration is authorized by this document.

## Verified in GitHub Actions runs #114 and #43082194864 (commit bdfa0300)
- Latest GitHub Actions run 43082194864 completed successfully across all four jobs: unit, postgres-integration, stripe-sdk-offline, and disposable-restore.
- Founder-provided Windows PowerShell output on 2026-11-12 shows local PostgreSQL 16.16 integration and concurrency scripts passed (2/2, 0 failures) against `healthwise_disposable` as `healthwise_test` at `127.0.0.1`. The tests reported transaction rollback, webhook retry/deduplication, and single-entitlement concurrency behavior. This is screenshot-reported local evidence, not an independently accessed local database.
- Founder-provided local unit test output reported 117/117 passing tests. Do not confuse this with the earlier 102-test CI baseline.
- The isolated engineering-only HTTP webhook harness and additional fail-closed regression tests exist on the rebuild branch; they are not mounted on the preview server.

- 102 dependency-free unit tests passed (0 failed) in run #114; all four jobs succeeded at that checkpoint.
- PostgreSQL 16 disposable integration passed: migration, uniqueness, rollback/retry, guarded payment transition, duplicate webhook concurrency using the actual repository adapter.
- Official Stripe SDK offline signature test passed: signed synthetic event, payload tampering rejection, invalid signature rejection, and simulated provider outage followed by retry.
- Two distinct webhook event IDs for the same Checkout session resulted in one paid transition and one booking entitlement.
- Synthetic disposable PostgreSQL 16 backup and isolated restore passed, preserving rows, uniqueness constraints, and foreign keys. This is **not** a production recovery test.
- Legacy webhook module delegates to the preferred signed short-transaction reconciliation path; tests cover provider-outage retry and idempotent redelivery.

## Protected Stripe read-only readiness (verified 2026-11-12)
- Founder configured GitHub environment `healthwise-stripe-testmode`, restricted it to `rebuild/healthwise-foundation-20261110`, and added environment secret `STRIPE_TEST_SECRET_KEY` (value never shared in chat or committed).
- Founder approved the environment-protected manual workflow dispatch.
- **GitHub Actions run 43354677062 / workflow #3 succeeded** on commit `403dd05`. Independently inspected job logs report: `PASS: Stripe test-mode read-only authentication verified (livemode=false)`.
- The workflow used a read-only Stripe balance API request; the logs explicitly state that it created **no** Checkout session, charge, webhook registration or deployment.
- A regression test `protected-stripe-workflow-boundary.test.mjs` now checks manual dispatch, branch restriction, read-only repository permission, protected secret reference, and the absence of transactional Stripe endpoints.
- **Not verified:** authenticated Checkout creation, webhook delivery, test-price configuration, or real end-to-end payment reconciliation. This successful authentication is not permission to create payment sessions or publish the app.

## Latest isolated checkout verification (2026-11-12)
- GitHub Actions run **43357182213** passed all four jobs with **122/122** unit tests (0 failures), including checkout redirect host/protocol validation.
- The isolated checkout adapter validates Stripe-hosted HTTPS redirects and rejects malformed provider responses; these are mock-only tests, not authenticated Stripe Checkout creation.
- Additional malformed-provider-response regression coverage was committed after that successful run and requires a fresh CI check.

## Unverified / blocking
1. **Real Stripe test-mode API:** Read-only Stripe test-mode authentication is verified; authenticated checkout creation, retrieved session, line-item API response, and provider-delivered webhook have not been tested against Stripe. The SDK tests use synthetic signed events and stubbed API calls.
2. **Production-grade webhook route:** The preferred `signed-reconciliation.mjs` is not mounted on the public preview server. An isolated, unmounted HTTP sandbox harness has regression tests for raw bytes, signature, size limits and retry responses. Production-grade routing, deployment configuration, timeouts, and observability remain unverified.
3. **Legacy webhook migration:** The former in-transaction provider lookup implementation was retired. `src/integrations/stripe-webhook.mjs` now delegates to the preferred short-transaction signed path. The migration is covered by offline tests but remains **unverified with authenticated Stripe sandbox calls and an HTTP endpoint**.
4. **Provider credentials:** Test credentials must be provided only through a protected secret store, never committed to GitHub, logged, or copied into chat. The protected `STRIPE_TEST_SECRET_KEY` passed read-only authentication; a dedicated `whsec_` test endpoint and its secure configuration remain unverified.
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
