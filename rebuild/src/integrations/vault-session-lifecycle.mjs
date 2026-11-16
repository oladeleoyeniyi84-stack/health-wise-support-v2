/**
 * Healthwise Engineering Vault — isolated session lifecycle contract.
 * Never route this module to production. Store operations must be durable and
 * atomic; approval/authentication is supplied by independent trusted middleware.
 */
import {createHmac,randomBytes,timingSafeEqual} from "node:crypto";
import {VAULT_COOKIE_NAME} from "./vault-request-auth.mjs";

const SUBJECT=/^[A-Za-z0-9_-]{3,100}$/;
const MAX_AGE_SECONDS=3600;
const cookie=(value,age)=>VAULT_COOKIE_NAME+"="+value+
 "; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age="+age;
export const clearVaultSessionCookie=()=>cookie("",0);

export function createVaultSessionLifecycle({
 signingKey,store,requireAuthenticatedPrincipal,verifySignedSession,
 now=()=>Date.now()
}={}){
 if(!Buffer.isBuffer(signingKey) || signingKey.length<32 ||
  typeof store?.createSession!=="function" ||
  typeof store?.rotateSession!=="function" ||
  typeof store?.revokeSession!=="function" ||
  typeof requireAuthenticatedPrincipal!=="function" ||
  typeof verifySignedSession!=="function" || typeof now!=="function")
  throw new TypeError("vault_session_lifecycle_dependencies_required");
 const key=Buffer.from(signingKey);
 const sign=id=>"v1."+id+"."+createHmac("sha256",key)
  .update("healthwise.session.v1:"+id).digest("base64url");
 const csrf=id=>createHmac("sha256",key)
  .update("healthwise.csrf.v1:"+id).digest("base64url");
 const current=()=>{
  const time=now();
  if(!Number.isSafeInteger(time) || time<0)throw new Error("invalid_session_clock");
  return time;
 };
 const authenticated=async credential=>{
  try{return await verifySignedSession(credential);}catch{return null;}
 };
 function issueResult(id){
  return Object.freeze({cookie:cookie(sign(id),MAX_AGE_SECONDS),csrfToken:csrf(id)});
 }
 return Object.freeze({
  /**
   * Must be called only after independent authentication (e.g., password/MFA).
   * There is no accepting a client-supplied subjectId or session identifier.
   */
  async issue(){
   const principal=await requireAuthenticatedPrincipal();
   if(principal?.serverVerified!==true || typeof principal.subjectId!=="string" ||
      !SUBJECT.test(principal.subjectId))throw new Error("vault_identity_required");
   const time=current(),id=randomBytes(24).toString("base64url");
   const result=await store.createSession({
    sessionId:id,subjectId:principal.subjectId,
    expiresAt:new Date(time+MAX_AGE_SECONDS*1000),revoked:false
   });
   if(result!==true)throw new Error("vault_session_creation_failed");
   return issueResult(id);
  },
  async rotate(credential){
   const session=await authenticated(credential);
   if(!session)return null;
   const time=current();
   if(session.expiresAt.getTime()<=time)return null;
   const id=randomBytes(24).toString("base64url");
   // The store MUST revoke the old row and create the replacement in one
   // transaction under a row lock. False means no issuance.
   const rotated=await store.rotateSession({
    oldSessionId:session.sessionId,newSessionId:id,subjectId:session.subjectId,
    expiresAt:new Date(time+MAX_AGE_SECONDS*1000)
   });
   return rotated===true?issueResult(id):null;
  },
  async logout(credential){
   const session=await authenticated(credential);
   if(!session)return Object.freeze({revoked:false,cookie:clearVaultSessionCookie()});
   const revoked=await store.revokeSession({sessionId:session.sessionId});
   return Object.freeze({revoked:revoked===true,cookie:clearVaultSessionCookie()});
  },
  /**
   * CSRF token is returned only by a trusted same-origin authenticated page.
   * For mutations require EXACT same Origin and a header token, plus the
   * independently authenticated session. Do not bypass for "safe" POSTs.
   */
  async authorizeMutation({credential,origin,expectedOrigin,csrfHeader}={}){
   if(typeof expectedOrigin!=="string" || !/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?$/.test(expectedOrigin) ||
      origin!==expectedOrigin || typeof csrfHeader!=="string" ||\n      !/^[A-Za-z0-9_-]{43}$/.test(csrfHeader))return false;
   const session=await authenticated(credential);
   if(!session || session.expiresAt.getTime()<=current())return false;
   const expected=Buffer.from(csrf(session.sessionId),"ascii");
   const supplied=Buffer.from(csrfHeader,"ascii");
   return supplied.length===expected.length && timingSafeEqual(supplied,expected);
  }
 });
}
