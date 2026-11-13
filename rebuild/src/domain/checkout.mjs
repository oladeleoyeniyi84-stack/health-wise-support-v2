/**
 * Pure, fail-closed checkout request validation. Does not create charges.
 * Caller must authenticate the user and verify provider configuration.
 */
export function validateCheckoutRequest({ body, user, catalog, idempotencyKey }) {
  if (!user || typeof user.id !== "string" || !user.id.trim()) throw new Error("authentication_required");
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_request");
  if (typeof body.consultationKey !== "string" || !["quick", "full", "premium"].includes(body.consultationKey)) throw new Error("invalid_consultation");
  if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) throw new Error("invalid_idempotency_key");
  if (!Array.isArray(catalog)) throw new Error("catalog_unavailable");
  const item = catalog.find(c => c.key === body.consultationKey);
  if (!item || !/^price_[A-Za-z0-9]+$/.test(item.stripePriceId ?? "")) throw new Error("consultation_unavailable");
  return Object.freeze({
    userId: user.id,
    consultationKey: item.key,
    stripePriceId: item.stripePriceId,
    idempotencyKey
  });
}
