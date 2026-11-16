# Healthwise v2 — Gate 4: app-specific recovery verification plan

**Engineering Vault / NO-GO — 2026-11-15.** This is an evidence-gathering plan, NOT a production restore claim.

## Evidence already established
- The `disposable-restore` GitHub Actions job uses synthetic data in `healthwise_disposable` and `healthwise_restore_disposable` (PostgreSQL 16 service).
- Prior CI green results establish that the synthetic isolated restore test ran, but they do **not** verify a backup from the Healthwise production data store.
- Production database ownership, retention, PITR support, actual backup freshness, migration baseline and an independent restore destination have not been verified.

## Mandatory non-destructive inventory (no secrets in artifacts)
1. Identify the canonical Healthwise v2 **production** service and its dedicated database by resource IDs in the approved Render workspace. Do not assume that the BrandHub database is Healthwise's database. Confirm production access owner and deployment branch.
2. Record database engine version, backup/PITR feature availability, retention, next backup, encryption/access restrictions, approximate size and cost. Never retrieve database URLs/passwords into chat.
3. Review migration lineage and deployed schema history. Compare the exact deployed schema to versioned migrations; identify destructive operations, locking risks, backfill requirements and rollback behavior.
4. Designate an isolated restoration destination that has no shared credentials, public HTTP ingress, webhook receivers, Stripe keys or customer-facing integrations. Confirm whether restore validation can be performed without additional paid resources; request a cost decision first if not.
5. Execute an **approved** app-specific backup restore into the isolated destination; record source backup ID/time, restore time, table counts, indexes, constraints, foreign keys, permissions and application smoke test results with no personal data in logs.
6. Confirm PITR to a controlled timestamp where supported, then rehearse forward migration and rollback from restored data. Record elapsed time and compare to approved RPO/RTO.
7. Preserve separate audit evidence: operator, timestamp, resource IDs, exact migration commit, job/run URLs, redacted outcomes and reviewer decision.

## Fail-closed approval rules
- A synthetic CI restore can only satisfy an **offline test** checkpoint.
- Missing backup source, failed restore, absent schema verification, missing PITR evidence (where required), or unapproved expense => Gate 4 **OPEN**.
- Do not create a Render database, enable paid backups, modify retention, access production data, deploy, migrate or change Stripe settings from this plan.
- Do not close Gate 4 without independently reviewed **production-source backup** and isolated restore evidence.

## Workstream dependencies
- First resolve the Render workspace identity with the Founder before accessing workspace resources.
- Continue Gate 2 middleware integration separately; there is no verified hosted session provider on the safe preview server.
- Keep Bondedlove and Video Crafter under their own Engineering Vault release decisions.
