# Healthwise preservation destination & cost decision — November 17, 2026

**Stage: OPTIONS EVALUATED / DESTINATION NOT APPROVED / NO DATA EXPORTED.** This is an addendum to `replit-current-database-preservation-runbook-20261117.md`. Replit Support #602887 recommended controlled `pg_dump` of the **current** production database; this would not recreate the Nov 8 scheduled backup.

## Grounded sizing boundary

The founder's Replit Production Database Settings screenshot displayed **53.98 MB** usage within a 100 GB allocation. **This is not the projected compressed `pg_dump` size**, nor does it establish the amount of historical customer data. Budget conservatively for source database structures, potential compressed archive, encrypted temporary space, storage replicas, metadata and future growth. No row counts or customer records were queried.

## Published cloud object-storage alternatives (public price research, Nov 17, 2026)

| Option | Published indicative storage price | Operational consideration |
|---|---|---|
| Backblaze B2 | $6.95/TB/30 days (pay-as-you-go) | Candidate for small encrypted private archives; business associate agreements available on request for eligible healthcare customers, but terms, scope, activation and eligibility not yet confirmed. |
| AWS S3 Standard | approximately $0.023/GB-month in commonly quoted US regions | Provider supports HIPAA-eligible S3 and BAAs under qualifying accounts; monitor request, key-management, monitoring and transfer charges, and required configurations. |
| Cloudflare R2 Standard | $0.015/GB-month, 10 GB-month free tier | Cheap raw storage, but Cloudflare says BAAs are Enterprise-only; **do not treat free tier as automatically approved for ePHI**. |
| Wasabi Hot Cloud Storage Pay-Go | from $7.99/TB-month (2026), standard 1 TB monthly minimum and 90-day minimum duration | Disproportionate minimum for a roughly tens-of-MB source; not preferred for this use. |

**Source URLs:**  
- https://www.backblaze.com/cloud-storage/pricing  
- https://www.backblaze.com/cloud-storage/compliance  
- https://aws.amazon.com/s3/pricing/  
- https://aws.amazon.com/compliance/hipaa-eligible-services-reference/  
- https://developers.cloudflare.com/r2/pricing/  
- https://www.cloudflare.com/trust-hub/us-privacy-compliance/  
- https://wasabi.com/pricing/faq  
- https://www.hhs.gov/hipaa/for-professionals/faq/may-a-hipaa-covered-entity-or-business-associate-use-cloud-service-to-store-or-process-ephi/index.html  

**These prices are advertised rates only, not an account-specific quote.** They omit export transfer/egress, storage requests, encryption/key management, isolated restore compute, VAT/taxes and any minimum, membership or regulatory agreement charge. Verify actual pricing and legal requirements before spend.

## Preliminary recommendation — NOT an authorization

**Backblaze B2** is the leading candidate **only if** the founder-controlled account is approved and any necessary legal/privacy review and business associate terms are satisfied **before** ePHI is transferred. Use a private bucket, least-privilege account access, MFA, client-side archive encryption with independent key custody, versioning/Object Lock only after a deliberate retention decision, restricted audit logs and a separately tested ability to retrieve and decrypt an authorized archive. Cloud provider managed encryption alone does not replace client-side controls or a legal data classification.

**Fallback:** an appropriately controlled and configured AWS S3 account if procurement and compliance fit better. No decision has been made to create either account, bucket or cloud service. If HIPAA applicability is uncertain, resolve it as a required precondition, rather than assuming that wellness data is automatically or never regulated.

## Exact approval gate

Before any first export:

1. Confirm Replit source project/database identity and approved access path. Prefer a read-only credential and ensure there is no production restore/write.
2. Founder approves **one** destination provider and private ownership/admin access, MFA, encryption/key custody, location, audit, retention and deletion policy.
3. Document data sensitivity/privacy and whether a BAA or other vendor contract is needed; execute required agreements *before* cloud ingestion.
4. Obtain provider-specific written cost estimate including all relevant fees and approve a spending limit; separately specify budget for one-time isolated PostgreSQL restore rehearsal.
5. Approve a source `pg_dump` operation in writing with bounded execution scope, secure credential transport and non-sensitive audit evidence. Approval to plan is **not** approval to execute.
6. Perform export, encrypted archival verification and isolated restore in separately authorized, isolated steps. Only actual successful restore evidence can close recovery gates.

**Decision:** BACKUP_DESTINATION_OPTIONS_REVIEWED / BACKBLAZE_B2_PREFERRED_CONDITIONALLY / COST_AND_COMPLIANCE_UNAPPROVED / EXPORT_NOT_AUTHORIZED / PUBLIC_RELEASE_NO_GO.
