# Healthwise — secure production data preservation runbook (PLAN ONLY)

**Date:** November 17, 2026. **Status:** NOT APPROVED FOR EXECUTION; Engineering Vault NO-GO.  
**Source:** Replit Support ticket **#602887** (founder-supplied screenshot), and earlier owner-supplied Replit Production Database settings/backup screenshots. This plan is not a record of an export or restore.

## Provider-confirmed constraints and data boundary

Replit Support explained that scheduled backups **cannot be downloaded or restored into a separate database**, and the platform's scheduled-backup/PITR Restore controls **switch the live database**. Support suggested a client-controlled **`pg_dump` export from the current production database**, followed by restoration into a separately controlled PostgreSQL destination. The support reply said the Nov 8, 2026 backup **appears past its seven-day retention**; it did not independently demonstrate successful restore, exact expiration, live row counts, or a reproducible historical point.

**Critical distinction:** A new `pg_dump` of the current database captures a transactional snapshot of **current accessible data**, **not the November 8 historical backup or PITR point**. A current export must never be represented as recovery of deleted historical records. The original Replit public schema may contain intake information including birth dates, medications, allergies and health concerns, plus chat, email and payment/order data; the `stripe` schema may contain payment-related records. Treat the entire dump as **highly sensitive**.

## Stop conditions — mandatory before first connection/export

- **Separate founder authorization for execution** after approving the destination, operating system/secure operator, estimated total cost, handling requirements, and explicit scope of the export. This document alone is not authorization.
- **Correct-source identification:** verify account ownership, non-secret Replit project and database resource IDs, and association of the source with the reported PostgreSQL `neondb`. Identify the intended source at time of export, and check the primary vs read-replica distinction and expected lag. Do not disclose connection URLs.
- **Privacy/compliance classification:** determine contractual obligations, data classification, retention, permitted transfer/storage jurisdictions, access roles, and whether healthcare-specific legal requirements apply; secure appropriate vendor/processor terms before transferring data.
- **Costs:** confirm Replit connection/export traffic and any egress fees, destination PostgreSQL costs if needed for rehearsal, encryption/key management, storage, transfer, retention and deletion, and how charges stop. No Replit development or additional Replit expenditure without explicit approval.
- **Destination:** dedicated founder-owned encrypted private storage with versioning/access logging where available, least-privilege access, MFA, storage and access policy, key recovery and retention decisions; never GitHub, public bucket, chat, email attachment, or developer workstation without approved full-disk encryption.
- **Local tooling:** trusted isolated computer/runner with compatible PostgreSQL client version, sufficient temporary encrypted disk space, secure terminal history/log behavior, verified local clock and time zone; do not run from an uncontrolled shared runner or CI/CD workflow.

## Proposed controlled export sequence — NOT TO EXECUTE NOW

1. Owner verifies the source host/account/database through the secure Replit interface, separately from any public notes. Do not copy the masked `DATABASE_URL` into chat, a GitHub issue, shell command history, source file, or CI variable.
2. Credential custodian configures access using an approved secure secret mechanism (e.g., PostgreSQL password file with restrictive filesystem permissions or OS-managed secret injection). No credentials are printed or logged. Confirm source user has only the required **read-only** privileges; if it does not, stop and seek a reviewed access plan rather than raising privileges silently.
3. Determine PostgreSQL major version, available extensions, `pg_dump` client compatibility, table ownership, and scope including `public`, `stripe`, and any other application schemas. Avoid blanket exclusion of payment/auth-related data without a documented retention decision. Review whether dumping the `stripe` schema is permitted/appropriate and whether foreign data wrappers, large objects, or extensions need special handling.
4. Preflight encrypted destination capacity and use a **private, non-world-readable temporary file**, preventing automatic upload, shell debug output or logs of dump contents. Establish an expected filename, UTC creation time, and recovery owner.
5. **Only after explicit export approval**, use the PostgreSQL client tool `pg_dump` in custom archive format (e.g., `--format=custom`, `--no-owner`, `--no-acl`, explicit output path). It should use one consistent MVCC snapshot of the selected database; it cannot guarantee zero replica lag or historical state. Never invoke schema mutations, `pg_restore` against production, or Replit Restore controls. Do not paste the connection URL in command-line arguments or a support ticket.
6. Verify `pg_dump` exits successfully, the archive is non-empty, its file structure can be listed offline with `pg_restore --list`, and the encrypted copy reaches only the approved destination. Collect **non-sensitive** manifest metadata (archive basename, timestamps, source resource alias, client/server versions, total bytes, encryption/key-custody reference and SHA-256 digest) in an access-controlled evidence register; do **not** place the archive, sensitive catalog metadata, keys or data in GitHub.
7. Verify secured destination access and a second copy/retention policy, then securely remove approved temporary copies according to platform behavior and privacy policy. If any step fails, stop, retain non-sensitive error details and require a new decision; do not retry in a way that may incur costs or expose data.

## Separate-target restore rehearsal — distinct future authorization

**Only after the encrypted export and approved isolated destination exist**: create or identify an authorized disposable/isolated PostgreSQL instance with a **different database/credential** from Replit production. Confirm isolation, network ingress restriction, encryption, cost caps and automatic teardown before any restore. Restore from the approved archive with `pg_restore` into the isolated destination, never to Replit production. Check schema objects, required relationships, extension availability, non-sensitive aggregate record counts where policy permits, and application-level ownership constraints. Avoid exposing any individual rows or health information. Record checksums/integrity outcomes and teardown/deletion evidence in private access-controlled records. Mark *isolatedRestoreVerified* only upon independently reviewed successful evidence, not merely a passing disposable synthetic CI test.

## Explicit exclusions and operational controls

- Do not click Replit **Restore database**, change PITR retention, reveal/copy credentials into chat, create paid resources, query customer rows, run migration/SQL writes, change login/identity, start deployments, or merge Draft PR #1.
- Do not assume the `users.password` column implies a supported login provider; source report described anonymous signed browser sessions, which are not portable recoverable identities.
- The source schema reportedly lacks new owner/audit/Stripe fulfillment objects. Never run `drizzle-kit push` or other schema changes to make an export work.
- A current dump does not recover Nov 8 backup content or establish that database storage usage equals customer-record count.

## Approval/evidence matrix

| Gate | Evidence required | Current state |
|---|---|---|
| Historical Replit source association | Owner-reviewed project/database resource IDs | **Pending** |
| Current primary/replica freshness | Replit confirmation or approved metadata-only verification | **Pending** |
| Sensitive-data classification/legal transfer | Reviewed applicable requirements and access controls | **Pending** |
| Secure encrypted destination and key custody | Owner-approved design and restricted access | **Pending** |
| Total cost and billable actions | Written estimate and founder approval | **Pending** |
| Current production export | Successful `pg_dump` receipt and encrypted artifact | **NOT PERFORMED** |
| Isolated restore/integrity | Verified dedicated target and completed test | **NOT PERFORMED** |
| App migration/public release | Independent security, recovery, deployment and founder signoff | **NO-GO** |

**Decision:** METHOD_IDENTIFIED / PRESERVATION_PLANNED / EXECUTION_NOT_AUTHORIZED / HISTORICAL_RECOVERY_UNVERIFIED / PUBLIC_RELEASE_NO_GO.
