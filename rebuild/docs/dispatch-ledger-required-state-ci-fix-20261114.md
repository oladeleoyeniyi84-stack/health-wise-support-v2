# Healthwise v2 — Dispatch-ledger PostgreSQL NOT NULL regression correction

**2026-11-14 | Engineering Vault NO-GO | No Stripe/provider writes**

## Evidence
The user-provided GitHub Actions workflow-list screenshot shows run #314 and #315 failed after the dispatch-ledger PostgreSQL concurrency test was added. The screenshot does not show individual job logs. Source inspection identified a definitive mismatch:

- Design-only migration `006_checkout_dispatch_ledger.sql` declares `sandbox_checkout_dispatch_ledger.state text NOT NULL` with no default.
- `claimBlockedV2CheckoutDispatch` previously inserted only `order_id,request_sha256`. PostgreSQL therefore rejects the first claim due to absent `state`.

## Repair
- Corrected the INSERT to explicitly persist `state='outcome_uncertain'` in the same order-locked transaction.
- Added a unit regression assertion confirming the initial INSERT always names that exact state.
- The existing disposable PostgreSQL concurrency test remains unchanged: two simultaneous claims must yield one recorded uncertain outcome and one rejected duplicate, followed by checks against deletion, state reset and automatic retry.

## Next validation
The updated code is **committed, not yet verified green**. Inspect the latest GitHub Actions run on the new SHA, especially `postgres-integration` and `unit`. If it fails, use the failed job log to distinguish any additional defect rather than guessing.

All pricing remains inactive per last provider check. No production DB migration, hosted endpoint, Checkout session, webhook activation, new infrastructure cost, Replit operation or PR merge occurred.

**Release remains blocked.**
