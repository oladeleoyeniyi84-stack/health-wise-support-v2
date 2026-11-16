# Healthwise Canonical Backend — source-of-truth and data-preservation gate
Date: 2026-11-16. **Engineering Vault / NO-GO.** This does not authorize any data migration or production deployment.

## Architecture decision
The current `rebuild/candidate/` server is an isolated, dependency-free shell, not the canonical production backend. The legacy root build references missing `server/index.ts` and migration-related files. Selection of a new canonical backend is **deferred** until historical Healthwise data provenance and recovery obligations are known.

`candidate/canonical-readiness.json` is a machine-readable register of **currently unverified** dependencies, not evidence that a provider has no data. It records unknown ownership/hosting, historic record inventory, privacy and retention obligations, immutable preservation, isolated restore, trusted identity, clean full-stack build, app-owned database, migration review, private media storage, staging security, infrastructure cost, and founder release consent.

`scripts/check-canonical-readiness.mjs` validates the register and reports unresolved evidence. Its return is deliberately **NO_GO even if every boolean is set true**; a future independent, reviewed release process would be needed to approve a release. It is not an authorization API.

## Evidence acquisition sequence (READ-ONLY before any writes)
1. Locate the historical Healthwise hosting/account and identify accountable owner, supported service and database resource IDs. Do not infer app ownership from Brand Hub or Stripe sandbox resources.
2. Inventory data classes without exposing user records in chat, logs or screenshots: identity accounts, bookings, consultation records, payment/webhook events, uploaded media and any wellness information.
3. Confirm applicable retention/privacy controls, backup history, exports, data access constraints, and vendor deletion/recovery arrangements.
4. Capture approved immutable evidence of the historical system's recovery path, then prove an isolated restore before changing schema, moving hosting or rewriting authentication.
5. Select the canonical application entry point and migration architecture based on verified source/data ownership; then specify an app-owned least-privilege database, credential custody and recovery tests.
6. Implement and independently verify real server-side identity, audited database migrations, HTTPS ingress, observability, staging/security/recovery checks, cost approval and founder-approved public release.

## Tests and controls
- `test/canonical-readiness-contract.test.mjs` ensures missing evidence remains visible and that forged approval flags, production scope changes or malformed evidence values cannot turn the current register into a public release decision.
- The existing isolated GitHub Actions unit job now checks and reports the canonical readiness audit.
- No production secrets, real data, databases, Stripe live traffic, or paid services are accessed.

## Release boundary
A green CI result means this offline evidence register and other isolated tests passed. It does **not** prove ownership, backups, identity, full-stack production build, staging or compliance. Keep Draft PR #1 open/unmerged. No production database migration or deployment. **Founder review remains mandatory.**
