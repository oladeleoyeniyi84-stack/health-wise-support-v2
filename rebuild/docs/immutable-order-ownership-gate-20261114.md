# Healthwise Support v2 — Immutable order ownership gate (2026-11-14)

**Engineering Vault NO-GO — design and disposable CI only. No production migrations.**

## Risk closed in isolated schema
Even after a successful owner-bound journal reservation transaction, a privileged database update could previously reassign the order's account or alter an account's authentication subject. Either could invalidate the ownership guarantee before a future Stripe Checkout operation.

## New design-only migration
`rebuild/db/003_immutable_order_ownership.sql` defines two PostgreSQL BEFORE UPDATE triggers:
- Reject `consultation_orders.account_id` changes with `consultation_order_owner_immutable`.
- Reject `accounts.provider_subject` changes with `account_subject_immutable`.
- Self-assignments that preserve the stored identity are allowed. The migration does not modify the status or price transitions.

The invariant applies to regular SQL UPDATE paths, including administrative application connections subject to triggers. Database superusers or owners with sufficient privileges may disable triggers, so migration governance, restricted database permissions, audit trail and backup recovery remain required.

## Test gate
`rebuild/test/postgres-immutable-order-ownership.mjs` creates a disposable schema and applies migrations 001, 002 and 003 only there. It tests both owner-change attempts before and after journal reservation, account-subject substitution, harmless no-change updates, a competing owner change from a second connection, and successful idempotent reservations for the legitimate owner. The schema is removed afterward. CI's postgres-integration job invokes the new test.

Existing tests that intentionally simulate ownership reassignment continue to use only migrations 001 and 002; the new isolated test specifically verifies the migration 003 invariant. This keeps the earlier TOCTOU regression tests meaningful rather than silently disabling their simulated threat.

## Boundaries
This migration is **not applied to any persistent database**. No Checkout created, Stripe price activated, webhook enabled, app deployed, release branch merged, or Replit accessed.
- The newest CI run must be verified independently before certifying success.
- Review consequences for legitimate account consolidation and authenticated-identity recovery; add an explicit audited administrative remediation procedure rather than silently allowing owner reassignment.
- Apply production migration only after isolated real backup/PITR restore, rollback rehearsal, access-control review and founder approval.
- A stable idempotency key and journal state still do not prove that Stripe never received a creation request. Future controlled Checkout creation requires provider uncertainty/recovery gate and a dedicated signed webhook endpoint.
