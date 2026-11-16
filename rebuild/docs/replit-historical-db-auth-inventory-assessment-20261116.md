# Replit-reported historical database and authentication inventory — 2026-11-16

**Evidence origin:** Founder supplied the text of Replit's "Healthwise Support — Existing Infrastructure and Historical Data Inventory". This repository change transcribes and evaluates that *second-party report*. Neither this commit nor the connected GitHub tools independently queried the Replit production replica. Supporting raw catalog outputs, Replit app/resource ID, backup receipts, primary status, and restore results are not attached. Do not represent the reported observations as an independently confirmed production data system.

**Release decision: NO_GO.** Retain `rebuild/candidate/` unchanged. No merge, production database query, migration, credential retrieval, restore, or paid service.

## Source-reported catalog and app evidence

- Original hosting: **Replit**, independently founder-confirmed.
- Database: PostgreSQL using `pg`/Drizzle, database name `neondb`, schema `public`. Replit report says a **production read-only replica** answered metadata queries and `transaction_read_only=on`. This does not prove the primary is healthy or replication is fresh.
- Public production replica catalog: `users`, `email_subscribers`, `consultation_intakes`, `conversations`, `messages`, `consultation_orders`. The reported foreign key `messages.conversation_id → conversations.id ON DELETE CASCADE` and other index/constraint metadata require original evidence if they will inform migrations.
- Additional `stripe` schema exists, containing integration/sync tables; only table names were examined, not payment contents or Stripe account linkage.
- Sensitive potential data classes include consultation health concerns, medications, allergies, birth dates, emails and booking tokens. **Do not store rows, counts tied to identifiable users, hashes, tokens, or raw backup data in GitHub.**
- PostgreSQL `reltuples=0` reported for all six public tables: **only stale-prone planner estimates**, not proof of no data or exact counts.
- Replit workspace source reportedly has `server/index.ts`, `server/chatSession.ts`, `server/routes.ts`, `shared/schema.ts`, `shared/models/chat.ts` and `drizzle.config.ts`. In contrast, the connected GitHub v2 default branch lacks the corresponding server entry/config. This is evidence of a **Replit-workspace vs GitHub-source divergence**, not license to assume those Replit sources are preserved in GitHub.
- Reported app identity: anonymous 256-bit owner ID signed in an HMAC-SHA256 HttpOnly SameSite Strict cookie, seven-day expiry, `SESSION_SECRET` key. No active user login/registration route or established recoverable user authentication provider. `users.password` is a schema column only; no password-storage algorithm or legacy account access is established.
- Schema mismatch reportedly observed: absent `conversations.owner_id` and owner index; `consultation_orders.owner_hash` and `reconciliation_status`; absent `contact_submissions`, `stripe_fulfillments`, `verified_bookings`, `reconciliation_reviews`, `reconciliation_resolutions`; missing public audit triggers and `deny_reconciliation_mutation`. No migration was run.
- Backup: founder-reported scheduled production backup for November 6, 2026, seven-day retention and PITR; **not independently evidenced**. Replit report mentioned a historical Nov 5 date context; as of **Nov 16, 2026**, Nov 6 is past, but its completion and retention still require a direct receipt. Restoration to a separate destination is unverified.
- Deployment: Replit autoscale configuration and canonical `healthwisesupport.com` are indicated in workspace source, but deployment activity and suspension status were not independently checked.

## Decision and safeguards

**Path A (preferred): historical system candidate now identified, pending authoritative app-to-database association and recovery verification.** Do NOT mark `historicalData.databaseLocationVerified`, `ownerVerified`, `isolatedRestoreVerified`, or `trustedIdentityProviderIntegrated` as true. A second-party textual report is not enough to approve those release-gate fields.

1. Request non-sensitive Replit app/deployment/database resource IDs, account ownership and exact app-to-database association via owner-controlled metadata (no connection strings or secrets).
2. Preserve an accurate source snapshot/revision or owner-controlled access-controlled archive of Replit-specific `server/`, `shared/`, Drizzle configuration and migration history. Treat any export or cost-bearing action as separately authorized. **Do not include credentials or customer data in GitHub.**
3. Obtain actual backup/snapshot completion time, retention expiry, and platform confirmation whether **separate-target** restoration is supported, along with an estimated cost **before** any action. Do not click Restore or change existing data.
4. Review database schema and app source divergence by comparing *non-sensitive* structural metadata; plan additive migration only after safe preservation and isolated recovery are independently proven.
5. Design owner account identity separately from anonymous cookie ownership; cookie/session tokens must not be reused as new account credentials or publicly disclosed.
6. Independently verify production primary health, replica freshness and current site suspension before any migration or deployment decisions.

**Still unknown:** historical row existence/quantity, backup recovery success, authoritative Replit resource association, primary status, data retention obligations, application identity migration, production security readiness and cost.

**Decision: LEGACY_REPLIT_DATABASE_CANDIDATE_REPORTED / HISTORICAL_RECOVERY_UNVERIFIED / RELEASE_NO_GO.**
