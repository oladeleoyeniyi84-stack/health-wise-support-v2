# Healthwise Support v2 — isolated webhook hosting cost and risk decision

**Assessment date: 2026-11-14 | Release state: Engineering Vault NO-GO | Deployment: NOT authorized**

## Evidence
- Screenshot from GitHub Actions workflow list shows successful run #283 at commit `58402f3` for the no-side-effect isolated HTTPS readiness gate. Individual job test counts were not independently retrieved in this review.
- Render connected account lists one workspace named `Elevate360 Brand Hub`. The connected service inventory could not be read without explicit selection of its workspace ID. Therefore current paid Render instances, capacity, invoices, and incremental cost are **unknown**. Do not assume any additional Render service is free or that a paid plan is already active.
- Existing DigitalOcean WebOps droplet is known from previous development work, but its current capacity, security isolation, billing, and utilization have not been inspected. Do not deploy Healthwise webhook on it without separate host isolation and capacity review.
- The existing loopback webhook in CI and the preview server are separate; no externally reachable v2 webhook is active. Dedicated v2 sandbox prices were inactive at the last connected Stripe read-back.

## Pricing and tradeoffs (public list rates; USD, before taxes/overages)
| Option | Advertised baseline | Tradeoff |
|---|---|---|
| Current GitHub Actions synthetic testing | No additional hosting resource | Strong cost isolation, not an externally reachable Stripe endpoint |
| Render Free Node web service | $0/mo within limits | 15-minute idle spin-down, slow reactivation, ephemeral filesystem; unsuitable for dependable payment webhook delivery |
| Render Starter Node web + basic paid Postgres | Approx. $7 + $6 = $13/mo | Candidate for a **short, isolated nonproduction trial** only; separate persistent DB, backup/recovery, limits, secrets and monitoring require assessment and may increase charges |
| DigitalOcean Basic Droplet | From $4/mo (512 MiB) or $6/mo (1 GiB) | Admin burden; server, security maintenance, TLS, backups, durable DB, alerting and sufficient RAM not included by the base quote |
| Cloudflare Workers Free | 100k requests/day, 10 ms CPU/request | Different runtime; Node HTTP listener and PostgreSQL network/reconciliation workflow need redesign or an external trusted database backend |

Sources checked: https://render.com/pricing ; https://render.com/docs/free ; https://www.digitalocean.com/pricing/droplets ; https://developers.cloudflare.com/workers/platform/limits/

## Cost-control policy
- **Choose current $0 incremental hosting** while signing, request admission, durable reconciliation, Stripe test identities and recovery controls are verified offline.
- Do not rely on a free sleeping webhook server for reliable Stripe deliveries. If hosting is needed, prefer a deliberately scoped, short-lived **paid** isolated test service with an agreed maximum spend and explicit teardown, not a persistent unmonitored free service.
- Before any Render provisioning, inspect the correct workspace, current services/billing, free hours/bandwidth, and new service costs. Do not select a workspace or change billing automatically.
- The public pricing is not an invoice or quotation for this account. Actual usage, bandwidth, logging, database, restore and backup expenses may differ.

## Required gates before hosted sandbox operation
1. Founder confirms selected workspace/provider, incremental monthly and total spend cap, trial duration and teardown owner.
2. Verified independent TLS endpoint, DNS, ingress body/rate/concurrency controls and access restrictions; no production app or Replit route reused.
3. Managed `sk_test_` and `whsec_` credentials, rotated through secret manager and never stored in GitHub source, logs or chat.
4. Durable isolated PostgreSQL order/event store with migration 003, reconciliation retries, idempotency, backup/restore rehearsal, redacted audit logs and monitoring/alerts.
5. Approved session creation coordinator and provider uncertainty recovery, test-mode price/account preflight, no live processing.
6. Separate explicit authorization for new Stripe test webhook registration, v2 test price activation and bounded test Checkout creation. Public release remains a separate approval.

**Decision: DEFER HOSTING. Continue offline CI. No deployment, new recurring expense, Stripe mutations or release.**
