/**
 * Pure consultation catalog validation for the Healthwise rebuild.
 * No prices, claims, provider IDs or availability are invented.
 * Provider IDs are server-only; this module must never expose secret API keys.
 */
const allowed = new Set(["quick", "full", "premium"]);
export function validateConsultationCatalog(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error("catalog_required");
  const seen = new Set();
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("invalid_item");
    const { key, title, durationMinutes, stripePriceId, calendlyEventUrl } = item;
    if (!allowed.has(key) || seen.has(key)) throw new Error("invalid_or_duplicate_key");
    seen.add(key);
    if (typeof title !== "string" || !title.trim() || title.length > 100) throw new Error("invalid_title");
    if (!Number.isInteger(durationMinutes) || durationMinutes < 10 || durationMinutes > 180) throw new Error("invalid_duration");
    if (typeof stripePriceId !== "string" || !/^price_[A-Za-z0-9]+$/.test(stripePriceId)) throw new Error("invalid_stripe_price");
    let url;
    try { url = new URL(calendlyEventUrl); } catch { throw new Error("invalid_calendly_url"); }
    if (url.protocol !== "https:" || url.hostname !== "calendly.com" || url.username || url.password || url.search || url.hash || url.pathname === "/") throw new Error("invalid_calendly_url");
    return Object.freeze({ key, title: title.trim(), durationMinutes, stripePriceId, calendlyEventUrl: url.href });
  });
}
