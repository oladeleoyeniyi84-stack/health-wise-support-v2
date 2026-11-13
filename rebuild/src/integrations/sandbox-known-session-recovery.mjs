import { HEALTHWISE_V2_SANDBOX_ACCOUNT, getVerifiedV2SandboxSelection } from "./stripe-v2-catalog.mjs";
import { verifyOrphanSandboxSession } from "./sandbox-orphan-provider-lookup.mjs";
import { bindRecoveredSandboxSession } from "./sandbox-atomic-recovery.mjs";

/**
 * Engineering-only recovery of a KNOWN Stripe test Checkout session.
 * Uses read-only authenticated Stripe calls to establish account and session
 * identity before atomically binding a journaled attempt to its order.
 * No Checkout create, payment, expiration, or public route.
 *
 * A missing session ID is deliberately NOT discovered or recreated here.
 */
export async function recoverKnownV2SandboxSession({ stripe, pool, orderId, sessionId }) {
  if (typeof pool?.query !== "function" || typeof pool?.connect !== "function") throw new Error("pool_required");
  if (typeof stripe?.accounts?.retrieve !== "function" ||
      typeof stripe?.balance?.retrieve !== "function" ||
      typeof stripe?.checkout?.sessions?.retrieve !== "function" ||
      typeof stripe?.checkout?.sessions?.listLineItems !== "function") throw new Error("stripe_readonly_client_required");
  if (typeof orderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) throw new Error("invalid_order_id");
  if (typeof sessionId !== "string" || !/^cs_test_[A-Za-z0-9]+$/.test(sessionId)) throw new Error("invalid_test_session");

  // The stored record, not caller arguments, controls all expected payment data.
  const result = await pool.query(
    `SELECT o.id, o.status, o.configured_price_id, o.amount_minor, o.currency,
            o.consultation_key, o.stripe_session_id AS order_session_id,
            a.idempotency_key, a.configured_price_id AS attempt_price_id,
            a.state, a.stripe_session_id AS attempt_session_id,
            u.provider_subject
       FROM consultation_orders o
       JOIN sandbox_checkout_attempts a ON a.order_id = o.id
       JOIN accounts u ON u.id = o.account_id
      WHERE o.id = $1`,
    [orderId]
  );
  if (result.rowCount !== 1 || !result.rows?.[0]) throw new Error("recovery_order_not_found");
  const row = result.rows[0];
  const expected = getVerifiedV2SandboxSelection({
    tier: row.consultation_key,
    stripeAccountId: HEALTHWISE_V2_SANDBOX_ACCOUNT,
    livemode: false
  });
  if (row.status !== "pending" ||
      !["prepared", "bound"].includes(row.state) ||
      row.configured_price_id !== expected.priceId ||
      row.attempt_price_id !== expected.priceId ||
      Number(row.amount_minor) !== expected.amountCents ||
      row.currency !== expected.currency ||
      typeof row.idempotency_key !== "string" ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(row.idempotency_key) ||
      (row.order_session_id != null && row.order_session_id !== sessionId) ||
      (row.attempt_session_id != null && row.attempt_session_id !== sessionId)) {
    throw new Error("recovery_order_mismatch");
  }

  // Derive account verification FROM STRIPE, not a request-provided flag.
  const account = await stripe.accounts.retrieve();
  if (account?.object !== "account" || account.id !== HEALTHWISE_V2_SANDBOX_ACCOUNT) {
    throw new Error("stripe_sandbox_account_mismatch");
  }
  const balance = await stripe.balance.retrieve();
  if (balance?.object !== "balance" || balance.livemode !== false) {
    throw new Error("stripe_test_mode_required");
  }

  // The independent verifier's assertions are constructed only after those
  // authenticated checks; they must never be supplied by an HTTP request.
  const verifiedClient = {
    healthwiseVerifiedTestMode: true,
    healthwiseVerifiedAccountId: account.id,
    checkout: stripe.checkout
  };
  const verified = await verifyOrphanSandboxSession({
    stripe: verifiedClient,
    stripeAccountId: account.id,
    expectedAccountId: HEALTHWISE_V2_SANDBOX_ACCOUNT,
    sessionId,
    orderId,
    userId: row.provider_subject,
    tier: row.consultation_key,
    priceId: expected.priceId,
    amountCents: expected.amountCents,
    currency: expected.currency
  });

  // Expired/completed sessions require independent disposition, and a paid
  // session must not be mistaken for a booking entitlement.
  if (verified.status !== "open") {
    return Object.freeze({ action: "manual_review", reason: "session_not_open", orderId });
  }

  return bindRecoveredSandboxSession({
    pool, orderId, sessionId, priceId: expected.priceId,
    idempotencyKey: row.idempotency_key
  });
}
