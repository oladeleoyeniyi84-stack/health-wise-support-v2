import { HEALTHWISE_V2_SANDBOX_ACCOUNT, getVerifiedV2SandboxSelection } from "./stripe-v2-catalog.mjs";
import { verifyOrphanSandboxSession } from "./sandbox-orphan-provider-lookup.mjs";

/**
 * Engineering-only bounded read-only discovery. Stripe Checkout Sessions list
 * supports created[gte/lte], starting_after, limit; it does NOT offer a
 * server-side order metadata filter. An incomplete scan is never proof that
 * a session does not exist. Never create a new Checkout from this result.
 */
export async function discoverOrphanV2SandboxSession({ stripe, pool, orderId, now = new Date(), maxPages = 3 }) {
  if (typeof pool?.query !== "function" ||
      typeof stripe?.accounts?.retrieve !== "function" ||
      typeof stripe?.balance?.retrieve !== "function" ||
      typeof stripe?.checkout?.sessions?.list !== "function") throw new Error("readonly_discovery_dependencies_required");
  if (typeof orderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) throw new Error("invalid_order_id");
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) ||
      !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 5) throw new Error("invalid_discovery_limits");
  const result = await pool.query(
    `SELECT o.id, o.status, o.configured_price_id, o.amount_minor, o.currency, o.consultation_key,
            o.stripe_session_id AS order_session_id, a.idempotency_key, a.state,
            a.configured_price_id AS attempt_price_id, a.stripe_session_id AS attempt_session_id,
            a.created_at, u.provider_subject
       FROM consultation_orders o
       JOIN sandbox_checkout_attempts a ON a.order_id = o.id
       JOIN accounts u ON u.id = o.account_id
      WHERE o.id=$1`, [orderId]
  );
  if (result.rowCount !== 1 || !result.rows?.[0]) throw new Error("discovery_order_missing");
  const row = result.rows[0];
  const pinned = getVerifiedV2SandboxSelection({
    tier: row.consultation_key, stripeAccountId: HEALTHWISE_V2_SANDBOX_ACCOUNT, livemode: false
  });
  if (row.status !== "pending" || row.state !== "prepared" ||
      row.order_session_id != null || row.attempt_session_id != null ||
      row.configured_price_id !== pinned.priceId || row.attempt_price_id !== pinned.priceId ||
      Number(row.amount_minor) !== pinned.amountCents || row.currency !== pinned.currency ||
      typeof row.provider_subject !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(row.provider_subject) ||
      typeof row.idempotency_key !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(row.idempotency_key)) {
    throw new Error("discovery_order_mismatch");
  }
  const createdMs = new Date(row.created_at).getTime();
  if (!Number.isFinite(createdMs) || createdMs > now.getTime() ||
      now.getTime() - createdMs > 24 * 60 * 60 * 1000) {
    return Object.freeze({ action:"manual_review", reason:"attempt_outside_safe_search_window", orderId });
  }
  const account = await stripe.accounts.retrieve();
  if (account?.object !== "account" || account.id !== HEALTHWISE_V2_SANDBOX_ACCOUNT) throw new Error("stripe_sandbox_account_mismatch");
  const balance = await stripe.balance.retrieve();
  if (balance?.object !== "balance" || balance.livemode !== false) throw new Error("stripe_test_mode_required");
  const verifiedClient = {
    healthwiseVerifiedTestMode: true,
    healthwiseVerifiedAccountId: account.id,
    checkout: stripe.checkout
  };
  const from = Math.floor(createdMs / 1000) - 300;
  const to = Math.floor(now.getTime() / 1000);
  const candidateIds = new Set();
  let cursor;
  let exhaustive = false;
  for(let page = 0; page < maxPages; page++){
    const params = { limit: 100, created: { gte: from, lte: to } };
    if(cursor) params.starting_after = cursor;
    const listed = await stripe.checkout.sessions.list(params);
    if (!listed || !Array.isArray(listed.data) || typeof listed.has_more !== "boolean") throw new Error("incomplete_stripe_listing");
    for(const s of listed.data) {
      if(s?.livemode !== false || s?.mode !== "payment" ||
         !/^cs_test_[A-Za-z0-9]+$/.test(s.id ?? "") ||
         s.client_reference_id !== row.provider_subject ||
         s.metadata?.orderId !== orderId ||
         s.metadata?.consultationKey !== row.consultation_key) continue;
      candidateIds.add(s.id);
      if(candidateIds.size > 1) return Object.freeze({ action:"manual_review", reason:"multiple_matching_sessions", orderId });
    }
    if(listed.has_more === false){ exhaustive = true; break; }
    if(listed.data.length === 0) throw new Error("invalid_stripe_pagination");
    const nextCursor = listed.data.at(-1)?.id;
    if(typeof nextCursor !== "string" || !nextCursor || nextCursor === cursor) throw new Error("invalid_stripe_pagination");
    cursor = nextCursor;
  }
  if(!exhaustive) return Object.freeze({ action:"manual_review", reason:"incomplete_stripe_listing", orderId });
  if(candidateIds.size !== 1) {
    return Object.freeze({ action:"manual_review", reason:"no_unique_session_found", orderId });
  }
  const sessionId = [...candidateIds][0];
  const verified = await verifyOrphanSandboxSession({
    stripe: verifiedClient,
    stripeAccountId: account.id, expectedAccountId: HEALTHWISE_V2_SANDBOX_ACCOUNT,
    sessionId, orderId, userId: row.provider_subject, tier: row.consultation_key,
    priceId: pinned.priceId, amountCents: pinned.amountCents, currency: pinned.currency
  });
  return Object.freeze({ action:"candidate_verified", orderId, sessionId, status: verified.status });
}
