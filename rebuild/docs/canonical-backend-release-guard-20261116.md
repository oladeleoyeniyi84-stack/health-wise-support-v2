# Healthwise canonical backend — fail-closed release checkpoint (2026-11-16)

**Status: Engineering Vault / NO-GO. No merge, production use, hosting purchase, database migration, or payment activation.**

## What changed
- `scripts/assert-production-readiness.mjs` provides an explicit negative release decision. It always denies release until a separately reviewed evidence-backed implementation replaces this temporary guard.
- `test/production-readiness-denial.test.mjs` checks that packaging success and untrusted approval environment flags cannot flip that decision.
- The check does not read secrets, use production databases, send network requests, or exercise real Stripe transactions.

## Canonical application selection
**Selected engineering baseline:** the isolated `rebuild/` server and domain modules, with no payment, booking, admin, or account access. **Not yet selected as the production backend.** Root legacy server files and migration config referenced by its scripts remain missing in inspected source. Do not silently treat green preview CI as full-stack build readiness.

## Required backend construction order
1. **Preservation ownership:** identify whether past Healthwise users, booking information, Stripe events, wellness information or uploads exist in another account/provider. Document owner, export/retention obligations and preservation hold. No migration until proven.
2. **Build contract:** introduce a complete, explicitly versioned backend entrypoint, reproducible dependency lockfile, configuration validation, database migration runner, clean install/build/start in CI; keep staging artifacts separate from the Engineering Vault preview.
3. **Authentication and authorization:** trusted server-side session verification and stable authenticated principal, owner binding, least-privilege DB roles, audited administrative access and negative authorization/concurrency tests. Browser claims alone may never authorize a request.
4. **Isolated data:** approved private app-owned Postgres and storage design; transactional migrations, recovery tests, privacy retention/deletion, backup/PITR and independent restore evidence; never reuse BrandHub or Stripe sandbox databases by inference.
5. **Payments and bookings:** only after separately approved real test-mode provider scopes, account/price mapping, signed webhooks, idempotency and reconciliation. No live-mode charges.
6. **Hosting:** approved costed staging HTTPS ingress, secret management, observability, resource limits, rate limiting, support runbooks, failure injection and security review.
7. **Release:** exact deployed commit CI, staging acceptance, recovery/security evidence, and separate explicit founder approval. Keep this NO-GO guard in place until the release gate has a reviewed replacement and evidence trail.

## Evidence boundary
At the current checkpoint GitHub connector returned no workflow-run or combined check records for the new branch heads. Therefore **tests are committed but not certified green**. Past screenshot runs #429–#432 predate new build-gate changes. Source discovery and connected Render account inventory did not establish a Healthwise-owned production database, which does not disprove historical data in other providers.
