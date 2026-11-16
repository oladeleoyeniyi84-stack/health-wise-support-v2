# Healthwise candidate backend — isolated build contract (2026-11-16)

**Engineering Vault / NO-GO. This is not the production backend.**

## Scope
The root legacy application has scripts targeting `server/index.ts`, but that entry point, `drizzle.config.ts`, and the root lockfile are missing on the inspected rebuild branch. Preserving the unknown historical Healthwise hosting and data owner remains mandatory. Do not fabricate a replacement production schema or migrate historical records.

A deliberately minimal candidate has been added **separately** under `rebuild/candidate/`: `server.mjs` creates a dependency-free HTTP server, `start.mjs` binds explicitly to an ephemeral port on `127.0.0.1`, and `scripts/build-candidate.mjs` builds an allowlisted `dist-candidate/` artifact with a private package manifest. The candidate is *not* the preview build, and neither is a production backend.

## Build and verification
- `npm run build:candidate` uses only Node built-ins. Build fails when production, Render, user-supplied PORT/HOST, or release environment indicators are present.
- `npm test` includes `test/candidate-backend-build.test.mjs`, checking build reproducibility, artifact allowlist, private manifest, loopback binding, `GET /health` and unconditional refusal of account, checkout, consultation and admin routes.
- GitHub Actions runs the candidate build and syntax checks before the unit test job. `dist-candidate/` is ignored in Git.
- Only an explicitly local Health probe returns success, with `release: blocked`; all other requests return unavailable. This does not constitute an authenticated app, transactional service, or customer-facing functionality.

## Limits
No real identity provider, secure key management, durable app-owned PostgreSQL, migration runner, historic record inventory, signed provider integration, protected storage, hosting, monitoring, production backup/PITR or public deployment has been implemented. The standalone runtime intentionally offers no clinical or wellness data functionality. The root legacy build has **not** been repaired. Do not describe this isolated candidate as a complete full-stack application or a deployable release.

## Release decision
Only independent exact-commit passing CI establishes the tests succeeded. Even after success, the seven production release gates and separate founder approval remain outstanding. **Keep Draft PR #1 unmerged and Engineering Vault NO-GO.**
