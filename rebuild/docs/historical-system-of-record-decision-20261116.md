# Healthwise source-of-truth decision record — 2026-11-16

**Status: BLOCKED / NOT SELECTED. Engineering Vault NO-GO.** This is a read-only evidence assessment, not a declaration that legacy records do not exist.

## Read-only evidence checked

| Evidence source | Verified observation | What it does NOT prove |
|---|---|---|
| Health-wise private GitHub repository | Tracked Flutter iOS/Android scaffold, Codemagic iOS build configuration; inspected Dart entry point is starter counter demo | That no externally hosted Healthwise app or records ever existed |
| Health-wise-support public repository | Static FAQ/support-site assets, PWA manifest and links; no inspected persistent backend | That support-site marketing claims reflect an operational data system |
| health-wise-support-v2 default GitHub branch | Root manifest names Express/Drizzle but its referenced `server/index.ts`, `drizzle.config.ts`, `package-lock.json`, and `android/gradlew` are absent; file-path commit histories did not identify those missing paths | That there is no separate historical source or data export |
| Connected Render account | One accessible workspace, Elevate360 Brand Hub; listed services and databases are Brand Hub and sandbox resources | That Healthwise did not run in a separate account or hosting provider |
| Connected Stripe accounts | Healthwise Support Sandbox account is listed with `livemode=false` | Any live payment relationship, historical user/booking data or database ownership |
| Connected mailbox | Exact Healthwise domain, app slug, and mobile ID searches produced no attributable provider record; generic Healthwise matches are not infrastructure evidence | Absence of invoices, credentials, historical records or deleted messages |
| Public domain search | No reliable specific historical Healthwise hosting record established from indexed results | DNS history, ownership or connected provider account attribution |

## Architecture decision

**Keep** the current `rebuild/candidate/` dependency-free, loopback-only Engineering Vault backend as the engineering baseline. **Do not select or deploy a production backend or database** from the evidence above. Do not use the Brand Hub production DB or Stripe sandbox as an assumed Healthwise system of record.

The historical source-of-truth decision is a two-path gate:

- **Path A — legacy system found:** authenticated owner-controlled provider listing establishes a Healthwise-specific service or database; capture non-sensitive resource IDs, accountable owner, data categories, preservation/retention requirements, backup history and independent isolated restore evidence. Then review migration and authentication compatibility before any writes.
- **Path B — no recoverable legacy system identified after complete owner inventory:** preserve evidence that all relevant owner-controlled accounts and retention/archive locations were reviewed; document unresolved historical liabilities and obtain an explicit founder decision to establish a **new** production baseline. Never call it a recovered production system or silently discard possible historic records.

Neither path is complete today.

## Required owner-controlled verification
1. Review historical provider account inventories for hosting and DB/identity/storage integrations, including dormant/archived environments. Share only provider, non-secret app resource IDs, purpose, and responsible account owner.
2. Review authorized hosting/deployment project history for the exact Healthwise app/branch/domain, not similarly named entities. Do not access existing customer rows, auth tokens, medical details, or live Stripe resources to establish identity.
3. Review backup schedules, expiry, export/retention obligations, and private media custody in the account where the resource is actually located.
4. If an existing system is verified, design an owner-approved immutable preservation step and isolated restore rehearsal **before** schema migration, deletion, new database provisioning or public release.
5. Submit architecture, security/privacy, recovery and cost evidence for independent review and **separate founder release authorization**.

## Scope and provenance limitations
- The connected repositories, Render workspace, Stripe sandbox and mailbox are **not an exhaustive historical inventory** across all possible accounts, providers or deleted resources.
- Generic email/web search and static domain content are insufficient to certify a production data store.
- No database or authentication system of record is verified. No production API, DB or customer records were read; no resource was provisioned, migrated, merged or deployed.
- All existing Engineering Vault release and production restrictions remain in effect.

**Decision: HISTORICAL_OWNER_UNVERIFIED / RELEASE_NO_GO.**
