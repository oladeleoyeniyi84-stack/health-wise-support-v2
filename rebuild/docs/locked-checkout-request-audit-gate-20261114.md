# Healthwise v2 — Locked Checkout request consistency audit

**2026-11-14 | Engineering Vault NO-GO | No Stripe writes or hosting changes**

## Baseline
User-provided screenshot confirms GitHub Actions run #306 green at commit `754612f`. It covers previous full-request fingerprint work, not the new locked-audit changes.

## Engineering-only implementation
- `rebuild/src/integrations/stripe-v2-locked-request-audit.mjs` implements a **read-only, PostgreSQL transaction-scoped audit**. Re-derives the pinned v2 snapshot and the complete request hash including the exact success/cancel URLs from trusted server configuration.
- Uses `BEGIN`, one joined SELECT across order, account, prepared journal, base immutable snapshot and full immutable request record, with `FOR UPDATE OF o` to hold the order lock until audit completion.
- Rejects nonpending/paid orders, bound sessions, changed owner, tier, configured Stripe Price ID, amount/currency, altered idempotency keys, inconsistent immutable snapshots or URLs, and stale or invalid attempt timestamps; rolls back on any discrepancy.
- Returns only `action:'audit_verified_only'`, the order ID and full request digest, `providerWriteAuthorized:false`, `release:'blocked'`. No Stripe SDK import, Checkout create call, webhook registration, new route, entitlement or persistent DB write is possible from this function.
- Unit tests cover successful audited consistency, multiple tampering paths, stale attempt, rollback, and untrusted identity/origin failing before any DB I/O.
- Updated the **existing** disposable PostgreSQL full-request test, already wired to the `postgres-integration` job, to verify the locked audit succeeds with genuine SQL tables and rejects an altered order amount afterward.

## Scope and limitations
- The lock is released when the audit commits. An external Stripe write after the commit would need a **separate, approved, crash-safe transaction/dispatch design** that preserves all verified invariants across provider uncertainty; this audit is *not* that creation gate.
- The old generic Stripe Checkout creation adapter is still unmounted. Do not wire it into this audit or a web route.
- Passing offline CI does not prove real Stripe provider outcomes, actual isolated HTTPS hosting, webhook credential isolation, or production recovery readiness.
- The v2 test catalog remains inactive at the last independent provider check; no activation, provider write, infrastructure purchase, persistent migration, merge or public deployment occurred.

## Next required gates
1. Independently verify the newest GitHub Actions unit and disposable PostgreSQL jobs on the exact new SHA, including the locked audit.
2. Design an explicit provider dispatch/outcome state machine with durable uncertainty and manual review; never treat a committed audit as authorization to retry an ambiguous Stripe request.
3. Verify isolated HTTPS deployment/security/backup readiness, review costs and obtain specific founder approval before registering a webhook, activating test prices or creating a single sandbox Checkout.
4. Production requires actual PITR restore, migration rollback, monitoring and final release approval.

**Release decision: Engineering Vault NO-GO.**
