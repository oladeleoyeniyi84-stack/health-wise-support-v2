# Healthwise v2 — Legacy Hosting and Data Ownership Discovery (2026-11-16)

**Engineering Vault — NO-GO. Read-only discovery, no service/database changes.**

## Evidence from confirmed Render workspace
Workspace: Elevate360 Brand Hub (`tea-d79rav5m5p6s73a92740`).
Confirmed website service: `Elevate360BrandHub-1` (`srv-d88th2egvqtc73bf9mfg`), which deploys `Elevate360BrandHub` on `main`. Render service listing shows only the two BrandHub services and the Stripe sandbox receiver. The database listing shows `elevate360-db` and `elevate360-stripe-sandbox-db`. No Healthwise-named service or app-specific database was identified. This is **not proof** Healthwise lacks external infrastructure or historic data.

BrandHub `client/src/pages/HealthWiseProduct.tsx` (at `d6b7dee`) explicitly labels itself a marketing page without a Healthwise API/dashboard. Its unavailable notice preserves the Engineering Vault restriction.

## GitHub repositories inspected
- `oladeleoyeniyi84-stack/Health-wise`: private, `main`, minimal README; no deployment configuration identified through inspected paths.
- `oladeleoyeniyi84-stack/Health-wise-support`: public static/support-site README.
- `oladeleoyeniyi84-stack/health-wise-support-v2`: public, `main` package.json describes an Express/React/Drizzle/PostgreSQL-oriented application; its `rebuild/healthwise-foundation-20261110` branch contains the isolated Engineering Vault work. Package dependencies and script names do **not** prove actual deployment, credentials, data ownership or recoverability.

Repository code-search queries for `DATABASE_URL`, `render.com` and `healthwisesupport.com` on default branches did not surface a validated deployment mapping. Search absence is not conclusive; secrets and external hosting configuration may not be committed.

## Decision and outstanding evidence
**Healthwise production hosting/provider and source-of-truth database remain UNVERIFIED.** Neither BrandHub database is authorized as Healthwise recovery source, and the Stripe sandbox database is explicitly not a production backup.

Before commissioning an app-specific database or performing a recovery rehearsal:
1. Identify any historic external hosting / DB provider from owner-controlled account inventories (not by guessing from libraries or domain).
2. Establish whether Healthwise has historical user records or files requiring preservation and legal/privacy handling.
3. Confirm an owner-approved canonical app deployment architecture and estimated ongoing costs.
4. If an existing database is found, perform a read-only backup/retention inventory before an isolated restore; otherwise label this a new deployment baseline, not a recovered production environment.
5. Maintain app-specific Engineering Vault NO-GO and founder approval for any changes or paid provisioning.

**No deployment, migration, Stripe activation, secret access, production SQL, or infrastructure expense performed.**


## Verified follow-up inventory — 2026-11-16 (read-only)
Source: connected GitHub repository metadata and owner-confirmed Render workspace inventory. These are **infrastructure records only**, not database-content audits.

### GitHub resource identities
| Repository | Repository ID | Visibility | Default branch | Evidence limit |
|---|---|---|---|---|
| `oladeleoyeniyi84-stack/Health-wise` | `1038565186` | Private | `main` | README contains only a title; checked `package.json`, `render.yaml`, workflow directory and `server/index.ts` were not found |
| `oladeleoyeniyi84-stack/Health-wise-support` | `1039146712` | Public | `main` | Repository existence does not establish database ownership |
| `oladeleoyeniyi84-stack/health-wise-support-v2` | `1052390723` | Public | `main` | Draft PR #1 contains isolated rebuild code; deployment/history still unverified |

### Render resource identities
Workspace `tea-d79rav5m5p6s73a92740`:
- `Elevate360BrandHub-1` — `srv-d88th2egvqtc73bf9mfg`, repository `Elevate360BrandHub`, branch `main`.
- `Elevate360BrandHub` — `srv-d7ai3v14tr6s73ebts20`, repository `Elevate360BrandHub`, branch `main`.
- `elevate360-stripe-sandbox-receiver` — `srv-dbj9s38473hc739q1d30`, repository `Elevate360BrandHub`, sandbox branch.
- `elevate360-db` — `dpg-d892288jo6nc73de41fg-a`.
- `elevate360-stripe-sandbox-db` — `dpg-dbj9rumtlv9c73ckct4g-a`.

**No dedicated Healthwise service or database appeared in the inventoried workspace.** This does not establish that historical Healthwise records do not exist at another provider or in another workspace. The Brand Hub and Stripe sandbox databases are **not** authorized for Healthwise migration, backup or recovery by inference.

### Ownership evidence needed before next architecture decision
A verified provider/account administrator must supply a **non-sensitive resource inventory** for historical Healthwise hosting, database, authentication and durable file storage: provider name, service/database identifiers, environment purpose, responsible owner, relevant dates, backup/retention settings, and whether historical user/booking/payment/wellness records exist. Do not copy customer rows, credentials, connection strings, tokens or medical information into GitHub or this report.

Until an authoritative historical owner and recovery source are confirmed, the safe next action is owner-controlled account inventory and retention review, **not** new database provisioning or schema migration.

**Current decision remains Engineering Vault NO-GO.** No resource changes, production SQL, payment activation, deployment, cost or data access were performed in this read-only inventory.
