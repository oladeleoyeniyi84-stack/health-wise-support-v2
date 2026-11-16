/**
 * Engineering Vault only — request-local authentication adapter.
 * No production route, session issuance, cookies written, or global principal.
 * A trusted server must supply its own signing key/session store and database
 * connections. The cookie is a credential, NOT an assertion of identity.
 */
import {createPostgresOwnerReadProof} from "./postgres-owner-read-proof.mjs";

export const VAULT_COOKIE_NAME="__Host-healthwise_vault";
const COOKIE_MAX_BYTES=4096;
const TOKEN=/^v1\.[A-Za-z0-9_-]{8,128}\.[A-Za-z0-9_-]{43}$/;

/** Strictly read one host-prefixed cookie; ambiguity or malformed input denies. */
export function extractVaultCookie(req){
 const raw=req?.headers?.cookie;
 if(typeof raw!=="string" || raw.length>COOKIE_MAX_BYTES ||
    /[\r\n\x00-\x1f\x7f]/.test(raw))return null;
 let found=null;
 const pieces=raw.split(";");
 if(pieces.length>40)return null;
 for(const item of pieces){
  const part=item.trim();
  const pivot=part.indexOf("=");
  if(pivot<1)return null;
  const name=part.slice(0,pivot).trim();
  const value=part.slice(pivot+1).trim();
  if(!name || !value)return null;
  if(name===VAULT_COOKIE_NAME){
   if(found!==null || !TOKEN.test(value))return null;
   found=value;
  }
 }
 return found;
}

/**
 * Returns a new immutable request-specific authorization capability.
 * Neither credential nor verified session ID is exposed to the caller.
 * Requests MUST NOT share or cache the returned capability.
 */
export function createVaultRequestAuthorizer({verifySignedSession,pool}={}){
 if(typeof verifySignedSession!=="function" || typeof pool?.query!=="function")
  throw new TypeError("vault_request_auth_dependencies_required");
 return async function authenticateRequest(req){
  const token=extractVaultCookie(req);
  if(!token)return null;
  let session;
  try{session=await verifySignedSession(token);}
  catch{return null;}
  if(session?.serverVerified!==true || session.revoked!==false ||
     typeof session.sessionId!=="string" || typeof session.subjectId!=="string" ||
     !(session.expiresAt instanceof Date) ||
     !Number.isFinite(session.expiresAt.getTime()) ||
     session.expiresAt.getTime()<=Date.now())return null;
  // The closure captures *only this request's* verified session; there is no
  // mutable application-global current user or shared session variable.
  const read=createPostgresOwnerReadProof({
   pool,getAuthenticatedSessionId:async()=>session.sessionId
  });
  return Object.freeze({
   mayReadOwnedRecord:async({recordId}={})=>{
    if(Date.now()>=session.expiresAt.getTime())return false;
    return read({recordId});
   }
  });
 };
}

/** Documentation-only policy for a future trusted HTTPS cookie issuer. */
export const VAULT_COOKIE_POLICY=Object.freeze({
 secure:true,httpOnly:true,sameSite:"Strict",path:"/",hostOnly:true
});
