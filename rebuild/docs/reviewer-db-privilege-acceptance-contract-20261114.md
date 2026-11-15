# Gate 2 — Reviewer DB privilege acceptance contract

**Engineering Vault only; not approved for production.**

## Verified isolated evidence
- Founder-provided screenshot of GitHub Actions run #372 green at commit 5db01e8.
- Disposable PostgreSQL tests cover SELECT-only reviewer access, forbidden writes, authorization rollback and administrative revocation.
- These are isolated tests, not a verified production login or database-role configuration.

## Remaining critical boundary
The reviewer adapter with `useRowLocks:false` obtains `pg_advisory_xact_lock(720360,1)` before reading session and grant state. The admin revocation adapter obtains the same lock before updating. **This is cooperative**, not an enforced privilege rule. Any privileged direct UPDATE that skips the advisory lock can violate serialization.

The current disposable tests use `SET ROLE` from an administrator connection. They prove SQL privilege denials while that role is active, but **do not prove a dedicated, non-superuser application login cannot escalate back to its original session user**. A production-like integration test must connect using a separate LOGIN principal without membership in privileged roles. Never ship the administrative test database password as an app credential.

## Required implementation and acceptance evidence
1. Review a fixed-search-path, least-privilege database mutation API (e.g. SECURITY DEFINER owned by a dedicated non-login owner). It must acquire the advisory lock before any reviewer session/grant mutation and reject unapproved identity/permission changes. Audit object ownership, EXECUTE grants, default PUBLIC privileges, schema CREATE privileges and search_path hijacking.
2. Connect as separate low-privilege LOGIN identities for evidence writer and authorized revoker; assert writer cannot INSERT/UPDATE/DELETE/TRUNCATE/ALTER/CREATE, change role, invoke the revoker API, or disable guards. Assert admin can only invoke the narrow authorized revocation operation.
3. Exercise two independent database connections in both race orders: evidence transaction first and revocation first. Assert no post-revocation evidence write, no lost update, and rollback on failures.
4. Enumerate all application-accessible SQL mutations to reviewer sessions/grants and ensure direct table mutation is denied. Any privileged maintenance path must be separately documented and gated.
5. Preserve deny-by-default on missing authentication, expired/revoked sessions, inactive grants and provider ambiguity.
6. Require exact-head green CI, independent review and founder approval before deployment.

**Gate 2 decision: OPEN.** Do not provision production roles, activate payments or merge this branch.
