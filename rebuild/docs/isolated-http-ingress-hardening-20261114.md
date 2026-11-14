# Healthwise Support v2 — isolated HTTP webhook ingress hardening

**2026-11-14 | Engineering Vault NO-GO**

## Scope
Extended the existing **unpublished, loopback-only** `rebuild/src/isolated-sandbox-webhook.mjs` listener. The listener now:
- Requires an explicit `Content-Type: application/json` header (optional media-type parameters accepted); otherwise returns HTTP 415 before reading or verifying the event.
- Rejects missing Stripe-Signature headers or values longer than 8,192 characters with HTTP 400.
- Preserves the previously implemented 256 KiB bounded streamed raw-body handling, maximum 5-second body timeout, signature verification and retryable provider/database responses.
- Remains disconnected from `rebuild/src/server.mjs`, with no public routing, TLS hosting, webhook registration or production deployment.

Updated the existing local HTTP harness and offline real-Stripe-SDK tests to include the explicit JSON media type. Added a rejection test confirming malformed or excessive request headers never reach signature processing, provider line-item lookup or database transaction.

## Evidence and limitations
GitHub Actions screenshot showed the prior successful workflow run #274 at commit `cb1ac21`. The new hardening changes postdate that verified run and **must be independently tested** before claiming success.

The current test harness uses plain HTTP bound to `127.0.0.1`, strictly as an offline integration fixture. A real Stripe endpoint must separately require a managed TLS reverse proxy, validated source network posture, reverse-proxy streaming size limits, admission throttling, request concurrency limits, metrics, alerts, dedicated `whsec_` secret and isolated persistent storage. Do not expose this development listener directly.

The three dedicated v2 Stripe prices remain inactive based on the last read-back, and the legacy Replit webhook remains disabled. No Stripe write, Checkout creation, provider webhook registration, production migration, merge or deployment occurred.

## Next release gates
1. Inspect latest four GitHub CI jobs, particularly unit and offline Stripe SDK loopback HTTP.
2. Add isolated network-edge and secret rotation policies before any hosted webhook testing.
3. Review order journal/Checkout uncertainty controls before a *separately authorized* single test-mode Checkout.
4. Production PITR/restore, migration rollback and final founder release approval remain outstanding.
