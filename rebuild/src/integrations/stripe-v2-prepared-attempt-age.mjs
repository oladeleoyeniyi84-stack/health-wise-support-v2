/**
 * Pure engineering-only safety check for a pending Checkout journal receipt.
 * This never authorizes Stripe creation or re-creation. A journal may already
 * represent an unknown provider outcome even when fresh.
 */
export function assertFreshPreparedSandboxAttempt({
  createdAt, now = new Date(), maxAgeMs = 15 * 60 * 1000
}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) ||
      !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1 || maxAgeMs > 900000)
    throw new Error("invalid_attempt_clock");
  const timestamp = createdAt instanceof Date ? createdAt.getTime()
    : typeof createdAt === "string" ? new Date(createdAt).getTime() : NaN;
  // Five seconds accommodates modest DB/application clock skew; larger
  // future timestamps and any malformed value must be investigated.
  if (!Number.isFinite(timestamp) || timestamp > now.getTime() + 5000 ||
      now.getTime() - timestamp >= maxAgeMs)
    throw new Error("checkout_attempt_requires_review");
  return true;
}
