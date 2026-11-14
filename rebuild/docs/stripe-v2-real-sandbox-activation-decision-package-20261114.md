# Healthwise v2 — real Stripe sandbox Checkout: pre-activation decision package

**Prepared: 2026-11-14 | Decision: NO-GO for any real Stripe Checkout creation or public release.**

## Provider evidence (read-only; no provider writes)
Stripe account `acct_1T36fzDSAM5aSpF4` was queried in test mode. Dedicated v2 prices:
- quick: `price_1UbQvoDSAM5aSpF4YcfIcscG`, USD 49.00, **inactive**
- full: `price_1UbQvsDSAM5aSpF4dFOKCuVl`, USD 99.00, **inactive**
- premium: `price_1UbQvvDSAM5aSpF4cBcYrDI8`, USD 199.00, **inactive**

All were returned with `livemode:false`, `metadata.app=healthwise-v2` and the expected tier. The three old, unrelated test prices remain active and were not changed. The only listed webhook is `we_1UZjLPDSAM5aSpF4mki2GEil`, **disabled**, and points to a legacy `*.replit.dev/api/stripe/webhook` URL. **No enabled v2 endpoint exists.** Do not re-enable, reuse, or test against the legacy webhook.

## Code evidence
- `rebuild/src/server.mjs` intentionally returns 503 for booking, Checkout and other application operations. No payment/webhook route is currently deployed.
- `rebuild/src/integrations/stripe-v2-checkout-authorization.mjs` verifies the Stripe account, test-mode balance, pinned products and active prices; all current inactive v2 prices correctly block this preflight.
- `rebuild/src/integrations/stripe-v2-checkout-preparation.mjs` verifies the stored order and reserves an immutable journal attempt with amount, currency, tier and price rechecked in PostgreSQL. It **does not create Checkout**.
- `rebuild/src/integrations/stripe-sandbox.mjs` is an older separate Checkout creation adapter and is **not** wired to that verified preparation/journal gate or a deployed server route. A caller-set `healthwiseVerifiedTestMode` property is insufficient as a sole security assurance. This adapter must not be invoked in a live provider test until a security-reviewed server-owned coordinator binds verified account, catalog, order, attempt, exact Stripe parameters and recovery.
- Signed event/line-item reconciliation and disposable PostgreSQL tests exist, including the new offline signed SDK-to-PostgreSQL integration; passing synthetic tests is not evidence of a real provider-delivered webhook.
- GitHub Actions screenshot of the workflow listing showed **success** for run #253, commit `2854f34`. The screenshot did not provide individual logs/counts, so do not infer updated unit totals from it.

## Required pre-activation deliverables
1. **Dedicated isolated test host** separate from public production and Replit; authenticated, TLS-only, restricted inbound Stripe webhook route using raw body, signature, event size and rate controls; private durable PostgreSQL with reviewed schema; protected `sk_test_*` and `whsec_*` credentials in an appropriate secret manager. Confirm endpoint URL **without** exposing secrets.
2. **Trusted Checkout coordinator**: server derives the authenticated user, validates exact v2 tier, active product/price, amount/currency, stores a stable key before any Stripe write, requires recent reservation and order state, and uses only a server-approved return origin. No request-controlled `healthwiseVerifiedTestMode`, arbitrary Price ID, idempotency key, session ID, user ID or return URL.
3. **Provider uncertainty controls**: timeout, crash-safe idempotency and orphan discovery, strict duplicate/expired/open/completed session dispositions, manual review rather than blind retry beyond provider retention.
4. **Webhook reconciliation**: independently verified test-mode signing secret, endpoint event allowlist (at minimum `checkout.session.completed` plus approved async payment events if applicable), strict signature, settled amount and one-line-item validation, atomic event and entitlement writes, provider retry behavior and redaction.
5. **Controlled scope of first provider run**: one **Quick** tier test (USD 49.00; no actual charged funds), one synthetic member/order in isolated database, one test card and signed event, confirm persisted session ID, one paid transition and one pending entitlement, replay no double grant, failure handling and audit log. No real member data, public links or automatic user emails.
6. **Backout plan**: disable newly created v2 webhook, deactivate any specifically activated test Price/Product, revoke the isolated test host access, verify no pending sessions and reconcile provider data before clean shutdown. Never touch legacy prices/webhook.
7. **Founder approval must explicitly authorize** the precise v2 test Price/Product activation, test-only Checkout session creation, a new isolated webhook endpoint, and the limited transaction scenario; these are not covered by routine development continuation. Production publication is a separate decision.

## Gate tracker
- [x] Previous offline CI and disposable integration coverage in place; latest workflow-list screenshot showed #253 green
- [x] Read-only provider catalog and webhook state checked
- [ ] Actual isolated HTTPS endpoint and test secrets verified
- [ ] Server-owned Checkout coordinator reviewed and integrated with durable journal
- [ ] Latest specific CI logs and dedicated integration results independently examined
- [ ] Test-mode provider operations explicitly authorized
- [ ] Bounded real Stripe sandbox Checkout + webhook test executed and reconciled
- [ ] Production backup/PITR isolated restore, schema migration/rollback, monitoring, security review, and final public go-live approval

**Current release state: Engineering Vault NO-GO. Do not merge or deploy the PR, activate test prices, create Checkout sessions, or enable webhooks based on this package alone.**
