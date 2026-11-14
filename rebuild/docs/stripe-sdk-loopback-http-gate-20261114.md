# Healthwise v2 — real Stripe SDK signature through local HTTP (2026-11-14)

**Engineering Vault NO-GO. No external endpoint, provider writes or production work.**

## Baseline
The prior workflow-list screenshot showed GitHub Actions run #271 successful at commit `5cd7c52`. It does not certify the new code in this report.

## Existing implementation reused
The rebuild already contained `rebuild/src/isolated-sandbox-webhook.mjs` and `rebuild/test/isolated-sandbox-webhook-http.test.mjs`, which test a loopback-only HTTP server with raw body, signature processing, streamed size limits, timeout, provider retry and replay. The new work does not duplicate or replace that server, and it remains disconnected from the public preview server.

## Added verification
- New `rebuild/test/stripe-sdk-loopback-http.mjs` uses the official Stripe SDK to generate and verify a cryptographic test signature across an actual local `127.0.0.1` HTTP listener, with an injected synthetic session and in-memory repository.
- Confirms tampered body with original signature is rejected before provider lookup; temporary injected Stripe provider outage produces HTTP 503 without recording the event; valid replay returns one paid decision and one duplicate without extra entitlement; unknown route is 404; public preview Checkout still returns 503.
- The CI `stripe-sdk-offline` job now runs the existing SDK signature test and new HTTP loopback test; the SDK is installed ephemerally and no Stripe API keys, paid provider calls, external URLs or real member data are used.
- This HTTP test is an offline **component integration**, not a real hosted Stripe webhook, and its in-memory repository is not a production database. Disposable PostgreSQL signed-reconciliation coverage remains separately in the `postgres-integration` job.

## Remaining gates
1. Confirm CI passing on this new commit before certifying this test.
2. Review request content-type enforcement, Stripe timestamp tolerance, reverse-proxy streaming limits, abuse/rate controls, observability and isolated HTTPS ingress prior to any deployed sandbox listener.
3. Verify isolated secrets and endpoint registration; the disabled legacy Replit webhook must never be reused.
4. Actual v2 sandbox catalog remains inactive. Test-only activation, Checkout creation and new webhook registration each require explicit founder permission.
5. Public release is blocked until production backup/PITR restore, migration rollback, monitoring, security review and founder approval.
