# Healthwise isolated data design (proposal; no migration executed)

Use a dedicated Healthwise database, not Elevate360BrandHub production DB. No paid resource has been provisioned.

## Tables (proposed)
- accounts: id, provider_subject unique, created_at, disabled_at
- consultation_orders: id, account_id FK, consultation_key, configured_price_id, currency, amount_minor, stripe_session_id unique, status enum (pending/paid/manual_review/refunded), created_at, updated_at
- provider_events: provider_event_id unique, event_type, received_at, processed_at, outcome, order_id nullable
- booking_entitlements: id, order_id unique FK, account_id FK, state enum (pending/ready/redeemed/revoked), booking_provider_ref nullable
- audit_events: id, actor_kind, actor_ref, action, target_ref, timestamp, outcome, metadata_redacted

## Transaction and security gates
- Account identity from verified server session, never request body.
- Persist pending order before creating checkout; bind checkout to order/account and exact provider price, currency, amount.
- Verify Stripe webhook signature against raw body using official SDK before invoking pure event policy.
- Persist provider event ID uniquely; transition order and entitlement atomically with row-level locking.
- Validate session ID, customer ownership, line items, price, amount, currency, and refund/chargeback semantics before granting entitlement.
- Reconcile async or delayed payment methods independently; checkout success redirects grant nothing.
- Booking requires authenticated ownership and confirmed paid entitlement; verify provider booking ownership.
- Enforce least privilege, CSRF defenses, rate limits, retention and encrypted backups; never store payment card details.
- Test isolated restore and migration rollback before production deployment.

No database, checkout API, webhook handler, account authentication, or booking integration is implemented by this document.
