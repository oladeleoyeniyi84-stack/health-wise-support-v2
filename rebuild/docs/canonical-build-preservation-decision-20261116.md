# Healthwise v2 — Canonical build and preservation decision register

**2026-11-16 — Engineering Vault / NO-GO**

## Phase 1 — Legacy preservation (open)
Read-only inspection found three relevant repositories:
- `Health-wise` (private, README only in inspected path),
- `Health-wise-support` (public support-site repository),
- `health-wise-support-v2` (full-stack manifest and separate isolated `rebuild/` folder).

In the founder-confirmed Render workspace, no standalone Healthwise service/database is identified. This **does not prove that historical users, wellness data, payment data, bookings or uploads do not exist** in another provider or historic account. DO NOT delete, repurpose, or overwrite such data. Account-level legacy hosting/domain/database ownership evidence must precede a migration or clean-start decision.

## Phase 2 — Canonical executable selection
**Engineering preview:** `rebuild/src/server.mjs` in the draft PR branch is the only selected runnable server baseline for isolated tests. It deliberately serves an engineering health endpoint and a fail-closed consultation catalog, while refusing account, Checkout, booking and admin endpoints.

**Not a production release:** The repository's original root `package.json` references missing `server/index.ts`, and its database push script lacks an inspected `drizzle.config.ts`. Legacy root `npm run build`, `npm start` and `npm run db:push` remain unverified. They must not be used as deployment commands.

**Executable smoke:** `node rebuild/scripts/smoke-preview.mjs`, or via GitHub Actions' dependency-free unit job, starts the real preview server on loopback, requests safe endpoints, and verifies that restricted Checkout/auth/admin routes remain 503. It does not create a production server or replace the missing legacy backend.

## Phase 3 — Required production implementation (not started)
1. Confirm preservation requirements and system of record for historical users, payments, bookings and wellness records.
2. Decide whether to reconstruct production application backend using reviewed `rebuild/` modules or repair the legacy root backend, with explicit migration mapping. Do not silently blend them.
3. Establish a private, isolated Healthwise database and media store only after founder cost and data-ownership approval.
4. Complete production session verification, RBAC, PostgreSQL grants, mutation APIs, privacy controls, retention, and application smoke tests.
5. Prove actual test-mode Checkout integration with separately approved write-capable Stripe scope, authenticated webhooks and reconciliation; never activate public payments based on mocks alone.
6. Obtain production-source backup/PITR and isolated restoration, deployment migration/rollback, TLS, logging, rate limits and operational alerts.
7. Verify all seven release gates and obtain founder signoff before any merge, public hosting or payment activation.

## Decision
**Selected for continued development:** isolated `rebuild/` engineering preview and its tests.
**Unresolved:** Whether Healthwise has app-owned production data in another provider.
**Blocked:** Public release, paid hosting, existing data migration, live provider mutations, and production rollout.
