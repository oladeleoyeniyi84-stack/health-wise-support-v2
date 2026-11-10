/**
 * PostgreSQL transaction adapter for signed sandbox events.
 * Requires an injected pg-compatible pool. No connection is made on import.
 * Caller must verify Stripe line items and settlement before using any paid
 * entitlement in production; this adapter is engineering-only.
 */
export function createEventRepository(pool) {
  if (!pool || typeof pool.connect !== "function") throw new Error("pool_required");
  return {
    async transaction(work) {
      const client = await pool.connect();
      let begun = false;
      try {
        await client.query("BEGIN");
        begun = true;
        const tx = {
          async recordEventOnce({ eventId, type }) {
            const result = await client.query(
              "INSERT INTO provider_events (provider_event_id, event_type, outcome) VALUES ($1, $2, 'received') ON CONFLICT (provider_event_id) DO NOTHING RETURNING provider_event_id",
              [eventId, type]
            );
            return result.rowCount === 1;
          },
          async lockOrderBySession(sessionId) {
            const result = await client.query(
              "SELECT o.id, o.account_id, a.provider_subject, o.stripe_session_id, o.status, o.amount_minor, o.currency, o.consultation_key FROM consultation_orders o JOIN accounts a ON a.id = o.account_id WHERE o.stripe_session_id = $1 FOR UPDATE OF o",
              [sessionId]
            );
            const row = result.rows[0];
            if (!row) return null;
            return {
              id: String(row.id), userId: row.provider_subject,
              stripeSessionId: row.stripe_session_id, status: row.status,
              amountMinor: Number(row.amount_minor), currency: row.currency,
              consultationKey: row.consultation_key, accountId: String(row.account_id)
            };
          },
          async applyDecision({ action, eventId, orderId }) {
            if (!["ignore", "manual_review", "mark_paid"].includes(action)) throw new Error("invalid_decision");
            if (action !== "ignore" && !orderId) throw new Error("order_required");
            if (action === "mark_paid") {
              const result = await client.query(
                "UPDATE consultation_orders SET status = 'paid', updated_at = now() WHERE id = $1 AND status = 'pending' RETURNING id, account_id",
                [orderId]
              );
              if (result.rowCount !== 1) throw new Error("order_transition_conflict");
              await client.query(
                "INSERT INTO booking_entitlements (id, order_id, account_id, state) VALUES (gen_random_uuid(), $1, $2, 'pending') ON CONFLICT (order_id) DO NOTHING",
                [orderId, result.rows[0].account_id]
              );
            } else if (action === "manual_review") {
              await client.query(
                "UPDATE consultation_orders SET status = 'manual_review', updated_at = now() WHERE id = $1 AND status = 'pending'",
                [orderId]
              );
            }
            await client.query(
              "UPDATE provider_events SET outcome = $1, order_id = $2, processed_at = now() WHERE provider_event_id = $3",
              [action, orderId ?? null, eventId]
            );
          }
        };
        const result = await work(tx);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        if (begun) {
          try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
        }
        throw error;
      } finally {
        client.release();
      }
    }
  };
}
