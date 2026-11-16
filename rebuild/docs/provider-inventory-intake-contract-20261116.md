# Healthwise Engineering Vault — provider inventory intake contract
Date: 2026-11-16. **Draft PR #1 / release NO-GO.**

## Purpose
Keep the existing isolated backend candidate unchanged while making historical provider discovery evidence safe to record. The contract at `rebuild/src/domain/provider-inventory.mjs` validates **non-sensitive metadata only**. This is not an importer, production credential verifier, account enumerator, database reader or migration script.

Allowed resource categories: web service, database, identity, object storage, payment **test** account, mobile CI, or other. Allowed fields: provider, resource kind, provider-generated non-sensitive resource ID, environment, evidence-source status (unverified, connected-account-listed, or owner-dashboard-reviewed), reported historical-data presence and reported backup configuration. Unrecognized fields, URLs, emails, connection strings and secret-like IDs are rejected.

Example (already identified through the connected Stripe account list; **test mode only**):

```json
{
  "provider": "stripe",
  "resourceKind": "payment-test-account",
  "resourceId": "acct_1T36fzDSAM5aSpF4",
  "environment": "test",
  "ownerEvidence": "connected-account-listed",
  "historicalData": "unknown",
  "backupEvidence": "unknown"
}
```

A connected-account listing is not an owner-reviewed dashboard audit. Even an owner-reviewed dashboard label is NOT evidence of historic Healthwise records, legal data ownership, verified recovery, or public deployment readiness. The validator always returns `safeToMigrate=false`, `safeToPublish=false`, and `productionOwnershipVerified=false`. The inventory evaluator always returns `NO_GO`.

## Required evidence outside this source tree
An authorized owner must independently identify the historical system-of-record in provider dashboards and verify service identifiers, database/media custody, data classes without sharing records, retention restrictions, real backup availability and isolated restoration feasibility. Store credentials, customer information, database URLs and medical information **nowhere in this PR**. Keep sensitive findings in an appropriately access-controlled owner environment, not issue comments.

## Verification
`rebuild/test/provider-inventory.test.mjs` tests accepted sandbox metadata, malformed fields, forged approval flags, duplicate resources, URLs, emails and secret-like identifiers. The existing isolated `npm test` glob includes the new test file. A passing test confirms structural validation only; it does not prove the completeness of any provider inventory.

Do not promote the candidate into production, create new databases, merge the PR, switch Stripe modes, or incur new expenses based on this evidence contract. Continue with owner-controlled provider inventory. **Engineering Vault NO-GO.**

## Evidence classification correction
The Stripe test-mode account was obtained from the connected account-listing integration, **not** from an independently reviewed owner dashboard. Its intake record must therefore use `connected-account-listed`, never `owner-dashboard-reviewed` unless a separate authorized dashboard review actually occurs. Neither classification establishes production ownership, recoverability, or permission to migrate.
