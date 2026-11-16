# Healthwise Engineering Vault — isolated HTTP mutation authorization gate
Date: 2026-11-16. **Draft PR #1 / NO-GO. No production route or user-data changes.**

## Exact-head CI evidence
At start of this checkpoint, exact PR head `d3477d623174d34cdd7791a3d2bfb2fa75f24131` returned no workflow-run records and no combined commit-status records through the connected GitHub integration. This means the CI result is **unverified**, not successful or failed. Old screenshots of workflow runs #429–#432 do not certify new commits.

## Source review correction
The previous CSRF canonical-token validation contained a literal backslash-n sequence (`||\\n`) between two JavaScript expressions. The resulting malformed source was corrected on this branch before new HTTP middleware work. The workflow now explicitly checks syntax of the lifecycle and mutation gate; a successful GitHub commit alone is **not** evidence the syntax check passed.

## New isolated boundary
- `src/integrations/vault-mutation-gate.mjs` rejects non-mutating methods, ambiguous duplicate Cookie/Origin/X-CSRF-Token headers, missing strict host-only signed cookie, untrusted transport, missing verified per-request context, invalid/missing CSRF, and absent independent **WRITE** permission.
- `test/vault-mutation-gate.test.mjs` exercises ordering, duplicate headers, missing inputs, trust-store outages and write-policy denial.
- `test/vault-mutation-loopback.test.mjs` creates a test-only Node HTTP server on 127.0.0.1; it uses synthetic signed sessions and CSRF tokens to verify parallel own-account requests are accepted and cross-account, missing-cookie, forged-CSRF and origin-mismatch attempts are rejected. The toy test mutation counter increments only after every check succeeds.
- The existing `npm test` glob runs these dependency-free tests. The CI workflow explicitly calls `node --check` for the new modules and the corrected lifecycle source.

## Mandatory trust boundaries
1. The loopback test uses `assertTrustedTransport: async()=>true` **only because it is a disposable HTTP fixture**. A real TLS-terminating server must provide authenticated proxy/transport assurance from trusted configuration, never from `X-Forwarded-Proto` or another client-controlled header.
2. Caller must supply an independently verified **write authorization policy** for the concrete operation and database record. **Read permission does not automatically grant write permission**. Fixture policies are only test stand-ins.
3. The module does not register a public route, execute a real mutation, issue login credentials or claim production identity-provider integration. Any future mutation handler must be invoked only after this gate and must use transactional, independently enforced authorization during the write (including TOCTOU and concurrent revocation protections).
4. CSRF on mutation endpoints (including logout and rotation) requires an authenticated same-origin HTTPS request, a protected per-session token and secure cookie settings; SameSite alone does not suffice. Harden duplicate header handling at the actual HTTP ingress as well.
5. Provider writes, Stripe, production databases, staging deployment, secrets, historical data migration, paid infrastructure and public release remain prohibited under Engineering Vault NO-GO.

## Verification needed
Obtain an exact-head GitHub Actions run and inspect the unit, PostgreSQL integration, disposal/recovery and offline provider jobs. After that, prioritize independent operation-specific permissions and fully transactional data-write authorization in a disposable database; real authentication issuance and canonical backend build remain separate hard gates.
