/**
 * Engineering-only server-auth adapter for Checkout evidence reviewers.
 *
 * The session and grant functions MUST be injected by internal trusted
 * authentication middleware and authorization storage. Never use an HTTP
 * body, unverified JWT claims, client-side roles, or a caller-supplied ID.
 * This adapter never performs a provider call or exposes a route.
 */
export function createTrustedV2ReviewOperatorResolver({
  loadVerifiedServerSession, lookupActiveReviewGrant, now = () => new Date()
} = {}) {
  if(typeof loadVerifiedServerSession!=="function" ||
     typeof lookupActiveReviewGrant!=="function" ||
     typeof now!=="function")
    throw new Error("trusted_review_auth_dependencies_required");

  return async function resolveOperator() {
    const session=await loadVerifiedServerSession();
    const clock=now();
    if(!(clock instanceof Date) || !Number.isFinite(clock.getTime()))
      throw new Error("invalid_review_auth_clock");
    // Session verification is performed by the trusted adapter upstream.
    // A boolean or role from a browser request is NEVER sufficient.
    const expiresMs = session?.expiresAt instanceof Date
      ? session.expiresAt.getTime()
      : NaN;
    if(session?.verifiedByServer!==true ||
       session?.revoked!==false ||
       typeof session.operatorId!=="string" ||
       !/^[A-Za-z0-9_-]{3,80}$/.test(session.operatorId) ||
       !Number.isFinite(expiresMs) || expiresMs<=clock.getTime())
      throw new Error("review_operator_forbidden");

    const grant=await lookupActiveReviewGrant(session.operatorId);
    if(grant?.operatorId!==session.operatorId ||
       grant?.active!==true ||
       grant?.permission!=="healthwise.checkout.review_evidence")
      throw new Error("review_operator_forbidden");

    return Object.freeze({
      id:session.operatorId,
      authenticated:true,
      permissions:Object.freeze(["healthwise.checkout.review_evidence"])
    });
  };
}
