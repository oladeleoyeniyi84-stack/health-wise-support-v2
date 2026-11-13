# Stripe sandbox webhook transaction contract — implementation boundary

The code in src/integrations/stripe-webhook.mjs validates raw signed events using an injected official Stripe SDK verifier and requires a transactional repository. **It is not connected to a live HTTP endpoint or PostgreSQL adapter.** Unit tests use mock verifiers and an in-memory mock transaction, so they do not prove actual Stripe signatures or database atomicity.

A future PostgreSQL adapter MUST implement repository.transaction(fn) with BEGIN/COMMIT/ROLLBACK and a single client connection. Its transaction object must provide:
- recordEventOnce({eventId,type}): insert into provider_events with ON CONFLICT DO NOTHING, return true only if inserted.
- lockOrderBySession(sessionId): SELECT ... FOR UPDATE from consultation_orders, joined to account identity; return normalized fields expected by the policy.
- applyDecision({action,eventId,orderId}): update event outcome and order/entitlement atomically, with authorization checks. Only mark_paid can grant an entitlement. Duplicate events must never apply twice.

Security work still pending before ANY integration: verify actual Stripe price ID and line items (not merely session amount); validate payment intent/settlement and asynchronous methods; reconcile refunds/disputes; define provider-event retry and dead-letter behavior; ensure order userId maps to authenticated account provider subject; check raw-body capture and signature tolerance; verify replay behavior and database constraints; run migration and restore rehearsal. Do not connect to production or grant booking rights yet.
