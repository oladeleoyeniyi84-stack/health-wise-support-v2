/**
 * Engineering Vault ONLY — synthetic HTTP mutation -> SQL function bridge.
 * Does not register routes or parse production bodies. Performs the write
 * as the last step of the CSRF/auth/permission gate, never as a separate
 * check-then-act authorization. No request-global session state.
 */
import {createVaultMutationGate} from "./vault-mutation-gate.mjs";
import {extractVaultCookie} from "./vault-request-auth.mjs";
import {createRestrictedNoteWriteExecutor} from "./postgres-restricted-note-write.mjs";

const SESSION=/^[A-Za-z0-9_-]{8,128}$/;
export function createVaultRestrictedMutationHandler({
  authenticateRequest,authorizeMutation,assertTrustedTransport,
  verifySignedSession,expectedOrigin,pool
}={}){
 if(typeof verifySignedSession!=="function" || typeof pool?.query!=="function")
  throw new TypeError("vault_restricted_http_dependencies_required");
 return async function handleMutation(req,{recordId,note}={}){
  const gate=createVaultMutationGate({
   authenticateRequest,authorizeMutation,assertTrustedTransport,expectedOrigin,
   authorizeOperation:async({request})=>{
    const credential=extractVaultCookie(request);
    if(!credential)return false;
    const verified=await verifySignedSession(credential);
    if(verified?.serverVerified!==true || verified?.revoked!==false ||
       typeof verified?.sessionId!=="string" || !SESSION.test(verified.sessionId) ||
       !(verified.expiresAt instanceof Date) ||
       !Number.isFinite(verified.expiresAt.getTime()) ||
       verified.expiresAt.getTime()<=Date.now())return false;
    const write=createRestrictedNoteWriteExecutor({
     pool,getVerifiedSessionId:async()=>verified.sessionId
    });
    return write({recordId,note});
   }
  });
  return gate(req);
 };
}
