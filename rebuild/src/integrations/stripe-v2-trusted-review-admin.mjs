/**
 * Engineering Vault only. Server-side administrator gate for reviewer access
 * revocation. The host must inject an authenticated, revocable server session
 * lookup and an independent authorization-store lookup. NEVER wire either
 * dependency to an HTTP body, browser roles, or unverified JWT claims.
 *
 * This module is NOT a session verifier or production route. It only evaluates
 * trusted adapter results; the DB revoker remains separately restricted.
 */
export function createTrustedReviewRevocationAuthorizer({
  loadVerifiedServerSession, lookupActiveAdministratorGrant,
  now=()=>new Date()
}={}) {
  if(typeof loadVerifiedServerSession!=="function" ||
     typeof lookupActiveAdministratorGrant!=="function" ||
     typeof now!=="function")
    throw new Error("trusted_review_admin_dependencies_required");
  return async function authorizeAdministrator() {
    // Fail closed on authentication, clock, and grant-store errors.
    const session=await loadVerifiedServerSession();
    const clock=now();
    if(!(clock instanceof Date) || !Number.isFinite(clock.getTime()))
      throw new Error("invalid_review_admin_clock");
    const expiry=session?.expiresAt instanceof Date?session.expiresAt.getTime():NaN;
    if(session?.verifiedByServer!==true || session?.revoked!==false ||
       typeof session?.operatorId!=="string" ||
       !/^[A-Za-z0-9_-]{3,80}$/.test(session.operatorId) ||
       !Number.isFinite(expiry) || expiry<=clock.getTime())
      throw new Error("review_admin_forbidden");
    const grant=await lookupActiveAdministratorGrant(session.operatorId);
    if(grant?.operatorId!==session.operatorId || grant?.active!==true ||
       grant?.permission!=="healthwise.checkout.review_access.revoke")
      throw new Error("review_admin_forbidden");
    return true;
  };
}
