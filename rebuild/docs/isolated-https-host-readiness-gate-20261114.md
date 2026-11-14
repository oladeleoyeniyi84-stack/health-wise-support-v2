# Healthwise v2 — Isolated HTTPS webhook host and secret readiness gate

**2026-11-14 | Engineering Vault NO-GO | No new costs**

## Evidence baseline
GitHub Actions screenshot showed successful workflow #280 at commit `04bbaaa`, confirming recovery of the header-hardening regression. New changes require their own successful CI run.

## Implementation (no side effects)
- `rebuild/src/integrations/stripe-v2-webhook-host-readiness.mjs`: a pure, read-only configuration **declaration validator** for a possible future private HTTPS Stripe test-mode endpoint.
- It rejects HTTP/local/Replit and public production hostnames, unexpected paths/query strings, nonstandard ports, live or mismatched Stripe accounts, missing or malformed webhook signing secret, secrets stored outside a managed secrets service, absent dedicated TLS host, missing reverse-proxy body cap or admission throttling, missing durable event storage and monitoring.
- It returns only boolean readiness, names of blockers, `checkoutEnabled:false` and `release:'blocked'`. It never logs or returns the signing secret or creates Stripe objects.
- `rebuild/test/stripe-v2-webhook-host-readiness.test.mjs` covers fully declared configuration, omissions, wrong account/live mode, weak secret source, disallowed endpoints, unchecked proxy limits, and retained release block.

## Important security boundaries
This validator **does not verify that claimed configurations actually exist**. A `ready:true` result means only that the supplied declarations conform to the policy, not that DNS/TLS, real reverse-proxy controls, secret-manager protections, server isolation, event persistence or monitoring were independently inspected. Its synthetic example URL and signature key are test fixtures; neither is a deployed resource or actual Stripe credential. The module is not wired to any endpoint.

Prior to any external webhook registration, require independently audited TLS/DNS ownership and certificate, private host access, managed test-mode secrets, ingress stream quotas, rate and concurrency limits, provider event allowlist, official Stripe timestamp verification, durable PostgreSQL reconciliation, alerts and incident runbooks. Avoid creating chargeable infrastructure before these are reviewed and specifically authorized.

The existing loopback webhook integration and public preview server are unchanged; the preview has Checkout disabled. The dedicated v2 prices remained inactive as of last independent Stripe read-back, and the old Replit webhook disabled. This commit does not re-read or mutate Stripe.

## Next
1. Independently verify newest GitHub Actions run for this exact branch SHA.
2. Add self-contained CI tests of TLS reverse-proxy and secret-injection behavior only if they can use ephemeral fixtures without hosted resources.
3. Review a low-cost isolated test-host design and actual ongoing charges **before** approving infrastructure, setting new secrets or registering a webhook.
4. Obtain separately scoped approval before price activation, test Checkout creation or external Stripe delivery; public release requires production backup/PITR restore, migration rollback and final founder approval.
