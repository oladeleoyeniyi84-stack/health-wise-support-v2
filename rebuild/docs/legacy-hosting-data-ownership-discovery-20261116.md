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
