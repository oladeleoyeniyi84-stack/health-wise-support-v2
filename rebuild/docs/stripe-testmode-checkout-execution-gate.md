# Stripe test-mode Checkout experiment — execution gate

**Status: NOT AUTHORIZED FOR EXECUTION. Engineering Vault NO-GO.**

## Verified prerequisites
- Protected GitHub environment `healthwise-stripe-testmode` and `STRIPE_TEST_SECRET_KEY` exist, per founder configuration.
- Protected read-only authentication workflow #3, run 43354677062, succeeded with `livemode=false`.
- GitHub Actions run 43357428591 passed four jobs, including 123/123 unit tests.
- Offline sandbox Checkout adapter and webhook reconciliation tests pass; **no authenticated Checkout session or delivered webhook has been verified**.

## Required before any API write
1. Founder approves **one specifically scoped** Stripe test-mode Checkout session creation. Read-only authentication approval does not cover writes.
2. Confirm a **dedicated Stripe test-mode Price ID** (`price_...`), product/consultation association, amount, currency, and whether it is active. Never assume production prices are test-mode prices.
3. Decide the test's side effects and cleanup: a created but unpaid Checkout session is a Stripe test-mode object; it can be expired. No payment simulation or entitlement grant without separate approval.
4. Use an isolated synthetic order and user identifier, not a real client or protected health information. Verify order/session persistence and idempotency before connecting any provider response to a database.
5. Restrict any future write-capable GitHub workflow to manual dispatch, exact development branch, protected environment approval, explicit test-only credential, one session maximum, timeout and no retry of session creation with a new idempotency key.
6. Never print API keys, full Checkout URLs, customer data, webhook payloads, or Stripe response bodies into GitHub Actions logs.
7. Confirm the test webhook signing secret and endpoint independently before attempting provider-delivered webhook tests. Do not enable public application webhook routes.
8. Verify failure handling, test-only cleanup and no additional cloud charges or paid infrastructure.

## Execution decision
**Blocked** until the founder separately approves the exact test-mode Checkout write and its defined side effects. This document and any CI run are not execution authorization.

## Production blockers unaffected
Production database PITR and isolated restore, migration rehearsal, provider webhook delivery, authenticated checkout persistence, refunds/disputes operations, alerting, and explicit release authorization remain unverified.
