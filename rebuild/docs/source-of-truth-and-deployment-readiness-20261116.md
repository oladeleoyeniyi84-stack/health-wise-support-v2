# Healthwise Support v2 — Source-of-truth and executable deployment readiness (2026-11-16)

**Engineering Vault: NO-GO. No production deployment or payment activation.**

## Verified read-only repository checks

- Canonical rebuild work is on draft PR #1, branch `rebuild/healthwise-foundation-20261110`. The `rebuild/src/server.mjs` preview intentionally serves only safe `/health` and public consultation catalog routes and fails closed for account/booking/checkout operations.
- In default branch `main`, root `package.json` references `server/index.ts` for `dev` and `build` and `dist/index.js` for `start`. Direct GitHub file lookup returned NOT_FOUND for `server/index.ts`. Direct lookup also returned NOT_FOUND for `drizzle.config.ts`, though the manifest declares `db:push: drizzle-kit push`. These discrepancies make an end-to-end production build **unverified** and potentially incomplete. Do not assume the advertised scripts succeed.
- `client/src/main.tsx` and `vite.config.ts` exist, which supports a frontend source tree, not proof of an operational full-stack backend or deployed data store.
- `Health-wise` is a separate private repository with minimal README; `Health-wise-support` is described as a support site. No inspected default-branch source identified active deployment configuration or ownership of a production PostgreSQL instance.
- The confirmed Render workspace has no identifiable standalone Healthwise service or database; `Elevate360BrandHub-1` deploys BrandHub's marketing website, and `/apps/healthwise` is explicitly an informational page only.

## Mandatory implementation sequence before a hosted staging build

1. **Preservation decision:** Establish whether any prior Healthwise users, bookings, uploads, payments, or wellness records exist in independently owned historic services. Preserve them before migration or retirement; do not declare legacy data absent from GitHub search results.
2. **Canonical build selection:** Decide whether to complete the existing default-branch backend or promote a fully reviewed isolated rebuild. Do not mix missing legacy server paths with the safe preview server and call it production-ready.
3. **Build proof:** Reconcile actual package entrypoints, config files, lockfile and migration runner; run clean install, typecheck, build and startup smoke tests on the exact proposed deployment commit.
4. **Data ownership:** Explicitly assign a separate Healthwise database and private storage boundary. Do not reuse BrandHub or Stripe sandbox databases by default.
5. **Authentication:** Integrate a real server-owned session verifier with restricted permissions; avoid test fixtures, browser claims, unverified identity and unaudited admin operations.
6. **Recovery and security:** Verify app-specific backup/PITR, isolated restore, migration/rollback, durable private storage, access control, observability, retention, HTTPS, and privacy requirements before opening any user path.
7. **Cost and approval:** Obtain founder decision on hosting/database plans and recurring costs prior to resource creation; retain draft PR, protected Stripe restrictions and Engineering Vault NO-GO.

## Known and unknown boundaries

The documented `DATABASE_URL`-style dependencies in package manifests or a Neon library dependency are **not evidence of a connected production database**. Repository code searches and missing configuration files do not prove nonexistence of historic customer data or providers. Separate account-level verification is required.

**No production SQL, hosting purchases, secret retrieval, provider mutations, merge or deployment performed in this assessment.**
