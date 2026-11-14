# Healthwise v2 — Auditable manual-review evidence gate

**2026-11-14 | Engineering Vault NO-GO | No provider or production operations**

## Verified baseline
The screenshot supplied by the founder shows GitHub Actions run #318 green at commit `c088757`, after correcting the explicit dispatch `outcome_uncertain` state. The newer changes in this document have not yet been independently CI-verified.

## Implemented in isolated rebuild only
- Design-only `rebuild/db/007_checkout_review_evidence.sql` creates a separate append-only, order-linked evidence journal. It records a bounded evidence category, SHA-256 digest referring to external access-controlled review material, a synthetic/operator identifier and timestamp. It prevents UPDATE/DELETE and deduplicates by order, evidence kind and hash.
- `rebuild/src/integrations/stripe-v2-review-evidence.mjs` validates order UUID, original immutable request hash, evidence kind, evidence hash and reviewer identifier. A conditional INSERT requires an existing dispatch-ledger row with the same request hash and `outcome_uncertain` or `manual_review` state. Exact duplicate evidence by the same reviewer is idempotent; mismatches fail closed.
- Unit tests cover valid record, exact duplicate, changed reviewer, wrong hash, invalid input and no dispatch row.
- Existing `postgres-v2-full-request-fingerprint.mjs` disposable PostgreSQL integration now applies migration 007 and exercises evidence recording, deduplication, mismatched request hash, database-level UPDATE/DELETE refusal, a second evidence record after transition to manual review and no-retry inspection. The existing PostgreSQL CI job already runs this script.
- No raw Stripe object, member details, key or hosted endpoint is stored by this implementation. A SHA-256 evidence reference must point to separately retained, access-controlled, auditable evidence; a digest alone does NOT prove that Stripe never created a session.

## Operational procedure (proposal, NOT an active support workflow)
1. Identify the blocked order and its original request hash using an authorized internal operator; never let a public caller choose the review actor.
2. Perform permitted **read-only** Stripe test-account/provider verification of the order's exact Checkout Session identity. Pagination gaps, no match, timeouts or multiple candidates must **not** be interpreted as safe to recreate Checkout.
3. Keep any provider records in restricted storage with minimum data retention, hash a redacted evidence bundle, and append only its SHA-256 and classification to the journal.
4. Escalate ambiguous, completed, expired, disputed or conflicting outcomes for authorized manual reconciliation; webhook signature, line items and atomic payment decisions remain mandatory.
5. Even if the dispatch ledger is marked manual review, **do not retry or clear uncertainty**. Any future supervised remediation and separately approved refund/cancellation protocol requires independent design and release approval.

## Open release gates
- Verify latest GitHub Actions jobs on the new exact branch head.
- Review real provider read-only recovery and operator authorization/RBAC, durable evidence storage, redaction and retention.
- Verify isolated HTTPS signing and durable database recovery before any test-host activation; assess expenses and obtain explicit founder approval.
- Production restore/PITR, migrations and rollback, security review, observability and public release approval remain unresolved.

**No Stripe objects modified; no price activation, Checkout creation, production migrations, Replit operations, new hosting expenditure or merge.**
