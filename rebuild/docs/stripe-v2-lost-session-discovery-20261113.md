# Healthwise v2 — lost Checkout session read-only discovery (engineering checkpoint)

**Engineering Vault NO-GO.** No price activation, Checkout creation, payment, webhook registration, Replit activity, production database change or deployment.

## Implemented
- `rebuild/src/integrations/sandbox-orphan-discovery.mjs`: bounded read-only Stripe Checkout Sessions list operation using `created.gte/lte`, `limit=100`, and `starting_after` pagination. Stripe does not provide server-side filtering by arbitrary Checkout metadata, so the code filters sessions locally and treats incomplete pagination as inconclusive.
- The search is bound to a pending, unbound journaled order and to the pinned v2 sandbox catalog. It authenticates the exact Stripe account and test mode by read-only API checks.
- Only one candidate from a **fully traversed** bounded search can proceed to additional read-only session and line-item validation. Multiple matches, no match, aged attempts, incomplete listing and uncertain provider outcomes all require manual review. Results never cause a new session to be created.
- `rebuild/test/sandbox-orphan-discovery.test.mjs`: offline cases for unique candidate, pagination, truncated listings, duplicate matches, no match, wrong account, live-mode response, incorrect order state, wrong Price ID and malformed API responses.

## Critical limitations
- The discovery function is not yet wired to the atomic known-session recovery orchestration; the candidate must be independently reverified and the order re-locked before any durable binding.
- Completeness is **only within the bounded timestamp range** and Stripe's returned pages; it is not proof that no earlier or unindexed session exists. No match must NEVER authorize a new idempotency key or replacement Checkout request.
- Current bounded scope is no more than 24h of journal age and at most five 100-item pages. An exhausted page budget is always a manual-review outcome, not successful absence.
- Strict role isolation is still required before a recovery worker is run: use trusted server-side credentials and database-derived order context, never a client-supplied account or amount.
- CI run lookup has not returned a qualifying result for this commit. The tests are committed but have not been independently certified green.
- Provider idempotency retention, production backups/PITR, authenticated signed webhooks, operational alerting, rollback and explicit release approval remain blockers.

## Provider API reference
Stripe Checkout Session listing supports `created` filters, `limit` and `starting_after`; it does not document arbitrary metadata filters. Confirm exact API behavior using the installed Stripe SDK before testing against the connected sandbox.
