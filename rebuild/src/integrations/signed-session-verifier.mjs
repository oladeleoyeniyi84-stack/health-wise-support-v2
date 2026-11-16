/**
 * Engineering Vault only — cryptographically authenticate a session credential.
 *
 * This adapter does NOT issue sessions, parse HTTP cookies, or expose a route.
 * The caller must supply a credential from separately trusted HTTP middleware;
 * never accept session IDs, roles or verified flags from a request body/query.
 * The signer and key management are deliberately outside this module.
 */
import {createHmac, timingSafeEqual} from "node:crypto";

const ID=/^[A-Za-z0-9_-]{8,128}$/;
const SUBJECT=/^[A-Za-z0-9_-]{3,100}$/;
const TOKEN=/^v1\.([A-Za-z0-9_-]{8,128})\.([A-Za-z0-9_-]{43})$/;

export function createSignedSessionVerifier({signingKey,loadSessionRecord,now=()=>Date.now()}={}){
 if(!Buffer.isBuffer(signingKey) || signingKey.length<32 ||
    typeof loadSessionRecord!=="function" || typeof now!=="function")
   throw new TypeError("trusted_signed_session_dependencies_required");
 const secret=Buffer.from(signingKey);
 return async function verifySignedSession(credential){
  if(typeof credential!=="string" || credential.length>180)return null;
  const match=TOKEN.exec(credential);
  if(!match)return null;
  const [,sessionId,signature]=match;
  const expected=createHmac("sha256",secret).update("healthwise.session.v1:"+sessionId).digest();
  const actual=Buffer.from(signature,"base64url");
  if(actual.length!==expected.length || !timingSafeEqual(expected,actual))return null;
  try{
   const record=await loadSessionRecord(sessionId);
   const current=now();
   const expires=record?.expiresAt instanceof Date?record.expiresAt.getTime():NaN;
   if(!Number.isSafeInteger(current) || !Number.isFinite(expires) ||
      record?.sessionId!==sessionId || record?.revoked!==false ||
      typeof record?.subjectId!=="string" || !SUBJECT.test(record.subjectId) ||
      !ID.test(sessionId) || expires<=current)return null;
   return Object.freeze({sessionId,subjectId:record.subjectId,
     serverVerified:true,revoked:false,expiresAt:new Date(expires)});
  }catch{return null;}
 };
}
