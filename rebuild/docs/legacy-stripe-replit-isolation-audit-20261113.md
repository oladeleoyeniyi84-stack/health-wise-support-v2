# Healthwise v2 — legacy isolation audit (initial evidence, 2026-11-13)

**Decision: NO-GO. Audit-first; no Stripe catalog mutation, Checkout session, webhook test, Replit action, or deployment.**

## Evidence inspected
- `main/package.json` retains `@replit/vite-plugin-cartographer` and `@replit/vite-plugin-runtime-error-modal` as development dependencies. Presence in source does **not** establish an active Replit deployment or billing.
- `main/vite.config.ts` imports the Replit runtime overlay and conditionally enables cartographer if `REPL_ID` is present in non-production mode. This is legacy coupling in code, not evidence of a running task.
- `rebuild/src/server.mjs` contains no Stripe, Calendly, or database calls and returns HTTP 503 for checkout/booking/API operations. It is an engineering preview only.
- `rebuild/src/domain/consultations.mjs` validates unique consultation keys and server-side Stripe Price IDs; `rebuild/src/domain/public-catalog.mjs` excludes Price IDs from public responses.
- `rebuild/src/integrations/stripe-sandbox.mjs` has a test-mode-only injected Checkout adapter, not mounted in the preview server.
- Founder screenshot of the Stripe Healthwise sandbox shows legacy Quick $49, Full $99 and Premium $199 consultation products. The screenshot does not reveal their Price IDs, webhook subscriptions, payment links or API usage.

## Confirmed Stripe sandbox webhook finding (founder screenshot, 2026-11-13)
- Stripe Workbench → Webhooks shows **one visible Active destination** with a truncated URL matching `https://fc445317-...rf.replit.dev/api/stripe/we...`.
- It is configured for **89 event types**, events from **Your account**, with **0% displayed error rate**. The screenshot does not establish request volume, last delivery, full endpoint path, or whether Replit is running/billing.
- **Risk:** account-level events from newly created sandbox products or Checkout sessions may also be delivered to this legacy Replit endpoint. Distinct v2 Price IDs alone do not isolate webhook delivery.
- **Required action before Stripe writes:** verify destination details, legacy dependency/usage and delivery history, then obtain founder approval to disable the legacy **sandbox-only** destination if no longer needed. Do not delete it or alter live-mode endpoints. Capture configuration evidence without webhook signing secrets.

## Not yet verified (external system inspection required)
1. Stripe sandbox identity of protected GitHub `STRIPE_TEST_SECRET_KEY` versus the Healthwise sandbox in the screenshot.
2. Full URL, delivery history, event selection and any additional destinations: one active Replit-targeted sandbox destination is confirmed in the screenshot.
3. Legacy Payment Links, Checkout configurations, active products/prices and any active customer-facing links.
4. Whether Replit deployments, scheduled tasks, integrations or billing resources remain active; do not assume code dependencies cause charges.
5. Any external Calendly-to-Stripe integrations that could trigger duplicate payment or booking behavior.
6. Whether the new v2 price catalog can be isolated within the same sandbox without account-wide legacy event consumers.

## Clean-build boundaries
- Preserve legacy products and payment history. Do not archive/delete or edit existing Stripe Price IDs until dependencies are mapped.
- After verifying account scope and webhook isolation, create **new sandbox-only** products named `Healthwise v2 — Quick Consultation`, `Healthwise v2 — Full Consultation`, and `Healthwise v2 — Premium Consultation`, with separate new Price IDs and proposed one-time USD amounts 49, 99, 199. No catalog changes are authorized by this audit.
- Keep the new Price IDs in protected server configuration, not committed in source or sent to the preview response. No Replit runtime or webhook URL is allowed in v2 deployment configuration.
- No new paid infrastructure, live Stripe operations, payment simulation, or release without founder approval.

## Next evidence collection
Review Stripe sandbox **Developers → Webhooks / Event destinations** and **Payment Links** (screenshots with secrets/customer data hidden). Check Replit dashboard billing/deployments without starting or restarting anything. Cross-check all destination URLs against known legacy services and the future isolated v2 endpoint.

## Confirmed remedial action (2026-11-13)
- Founder supplied broad authorization for engineering remediation, including disabling the legacy Healthwise sandbox webhook.
- Stripe connected API account: `acct_1T36fzDSAM5aSpF4`, **livemode=false**, name **Healthwise Support Sandbox**.
- Stripe API initial list confirmed a single endpoint `we_1UZjLPDSAM5aSpF4mki2GEil`, status `enabled`, 89 subscriptions, Replit URL ending `/api/stripe/webhook`.
- Updated **only** this sandbox endpoint using `disabled=true`. Stripe returned status `disabled`.
- Independently retrieved the same endpoint afterward; Stripe confirmed `status=disabled`, `livemode=false`, 89 preserved event subscriptions. No live endpoint edited or deleted.
- Stripe webhook configuration isolation improved; Replit deployment status, account billing, Payment Links, and independent integrations still need separate auditing. Do not declare Replit billing closed.
