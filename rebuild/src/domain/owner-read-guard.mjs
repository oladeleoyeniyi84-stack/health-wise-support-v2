/**
 * Healthwise Engineering Vault — route authorization contract.
 *
 * The resolver MUST run in trusted server middleware and verify a server-side
 * session using a credential that was not accepted from JSON, query parameters,
 * client roles, or arbitrary request headers. This module does not implement
 * authentication, issue sessions, or expose a production route.
 */
const ID=/^[A-Za-z0-9_-]{3,100}$/;
export function createOwnerBoundReadGuard({resolveVerifiedPrincipal,now=()=>Date.now()}={}){
  if(typeof resolveVerifiedPrincipal!=="function" || typeof now!=="function")
    throw new TypeError("trusted_identity_dependencies_required");
  return async function authorizeRead({recordOwnerId}={}){
    // No request object is accepted: caller cannot supply roles, cookies, or
    // a client-computed "verified" flag as an alternate authorization path.
    if(typeof recordOwnerId!=="string" || !ID.test(recordOwnerId))
      throw new Error("owner_read_forbidden");
    let principal;
    try{principal=await resolveVerifiedPrincipal();}
    catch{throw new Error("owner_read_forbidden");}
    const current=now();
    const expiry=principal?.expiresAt instanceof Date?principal.expiresAt.getTime():NaN;
    if(!Number.isSafeInteger(current) || !Number.isFinite(expiry) ||
       typeof principal?.subjectId!=="string" || !ID.test(principal.subjectId) ||
       principal?.serverVerified!==true || principal?.revoked!==false ||
       expiry<=current || principal.subjectId!==recordOwnerId)
      throw new Error("owner_read_forbidden");
    return Object.freeze({subjectId:principal.subjectId,scope:"owner:read"});
  };
}
