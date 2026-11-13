# Phase 8 — verification gate

New pure verification policy: src/integrations/stripe-line-items.mjs.

IMPORTANT: This policy is **not yet wired into** the signed webhook processor. It must be invoked with complete line items retrieved from the official Stripe API (including pagination checks), after signature validation and before any entitlement transition. Do not pass event-embedded or client-supplied line items as trusted evidence.

The current webhook handler may still mark an order paid without this independent line-item verification. Booking entitlements remain pending and the public booking endpoint remains disabled. The webhook-to-database integration must be revised to fail closed before any release.

Other blockers: real signed Stripe fixture tests; real isolated PostgreSQL concurrency and restore; full Stripe payment intent settlement/refund/dispute reconciliation; identity and authorization implementation; operational error recovery; validated provider prices and verified consent/privacy policy. No live Stripe, Render, Replit or database operations performed.
