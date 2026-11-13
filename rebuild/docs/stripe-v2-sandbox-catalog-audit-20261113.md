# Healthwise Support v2 — Stripe sandbox clean catalog verification (2026-11-13)

**Release status: ENGINEERING VAULT — NO-GO.** The Stripe operations described below were carried out only in connected sandbox account `acct_1T36fzDSAM5aSpF4` (`livemode=false`). No live account, Replit resource, Checkout session, Payment Link, payment, webhook or public deployment was created or changed.

## Pre-creation read audit
- Three legacy sandbox products and prices existed at $49, $99 and $199 USD, one-time; preserved unchanged.
- No Payment Links (`GetPaymentLinks: data=[]`).
- One webhook endpoint `we_1UZjLPDSAM5aSpF4mki2GEil`, which points to legacy Replit; its status was independently confirmed **disabled**.
- This evidence concerns only the connected Stripe sandbox; it does not prove Replit billing or separate Calendly integrations are inactive.

## Created new v2-only catalog — all INACTIVE
| Tier | Product | Product ID | Price ID | Amount | Duration |
| --- | --- | --- | --- | ---: | ---: |
| quick | Healthwise v2 — Quick Consultation | `prod_VcgIQdrdphLJU9` | `price_1UbQvoDSAM5aSpF4YcfIcscG` | $49 USD, one-time | 15 minutes |
| full | Healthwise v2 — Full Consultation | `prod_VcgIqoyCE8gQNR` | `price_1UbQvsDSAM5aSpF4dFOKCuVl` | $99 USD, one-time | 30 minutes |
| premium | Healthwise v2 — Premium Consultation | `prod_VcgITi8YWKS3TB` | `price_1UbQvvDSAM5aSpF4cBcYrDI8` | $199 USD, one-time | 60 minutes |

The v2 objects were created with `active=false`, `livemode=false`, and metadata `app=healthwise-v2`, `environment=engineering-sandbox` and tier. Product metadata also records duration and `legacy_replit=false` (a label, not proof of external connectivity).

## Independent post-write read verification
- `GetProducts`: six products total, three original active and three new v2 inactive.
- `GetPrices`: six prices total, three original active and three new v2 inactive, all USD one-time.
- `GetWebhookEndpoints`: one endpoint, still disabled.
- `GetPaymentLinks`: zero, unchanged.

## Next gates — no automatic activation
1. Validate the GitHub protected test-mode credential belongs to this exact Stripe sandbox account before provider test calls; earlier balance `livemode=false` authentication did not prove account identity.
2. Recheck other external Calendly/Replit integrations and operational billing separately.
3. Add server-only tier-to-Price-ID mapping for v2, or protected configuration; never expose API secrets, put keys in Git history, or mix legacy IDs.
4. Design isolated signed webhook destination, persisted order binding and recovery. Only use developer-approved manual test-mode Checkout after narrow approval and activation of relevant test prices.
5. Production backups/restore, schema migration, release and monitoring gates still block public release.
