# Healthwise v2 — safe orphan-session triage checkpoint

**Engineering Vault: NO-GO. No Stripe writes, product activation, Replit tasks, public payment routes, or production migrations.**

## Implementation
- `rebuild/src/integrations/sandbox-checkout-recovery.mjs` provides a read-only query to inspect existing attempt and order state. It never creates a Checkout session, retries a Stripe request, expires an object or changes PostgreSQL rows.
- Fresh unresolved `prepared` records with no persisted session return `provider_lookup_required`: the Stripe outcome is unknown even if no local session ID exists.
- Older unresolved records return `manual_review`. The 15-minute threshold is a conservative **internal escalation heuristic**, not a Stripe idempotency retention guarantee.
- A record returns `bound` only when the attempt and order are both pending and reference the same syntactically test-mode session.
- Inconsistent states, invalid or future creation times, missing records and malformed arguments fail closed.
- `rebuild/test/sandbox-checkout-recovery.test.mjs` exercises unknown outcomes, stale attempts, matching bindings and inconsistent state.

## CI and remaining gaps
- GitHub commit run lookup did **not** return a current PR-associated workflow run for the last journal or recovery commits. Do not claim new tests or disposable PostgreSQL integration have passed until independently checked.
- This module is a **triage policy**, not full crash recovery. Before any Stripe Checkout write, implement an authenticated read-only provider lookup with trusted account context and an atomic transaction that writes the same session ID to both order and attempt journal; add crash-injection tests at each boundary.
- An unbound attempt must never automatically generate a replacement Checkout session using a new idempotency key, even after the 15-minute escalation threshold.
- The new v2 sandbox products/prices remain inactive, and the legacy Replit webhook remains disabled.
