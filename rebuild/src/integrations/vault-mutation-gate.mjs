/**
 * Engineering Vault only. No production route is registered here.
 * All required checks run BEFORE a caller may invoke a mutation handler.
 * The trusted authorization callback must independently establish operation-
 * specific permission; ownership READ permission is NOT write permission.
 */
import {extractVaultCookie} from "./vault-request-auth.mjs";

const MUTATIONS=new Set(["POST","PUT","PATCH","DELETE"]);
const HEADER_NAMES=new Set(["cookie","origin","x-csrf-token"]);

function uniqueHeaders(req){
 const raw=req?.rawHeaders;
 if(!Array.isArray(raw) || raw.length%2!==0)return false;
 const counts=new Map();
 for(let i=0;i<raw.length;i+=2){
  const name=raw[i];
  if(typeof name!=="string")return false;
  const lower=name.toLowerCase();
  if(HEADER_NAMES.has(lower)){
   counts.set(lower,(counts.get(lower)||0)+1);
   if(counts.get(lower)>1)return false;
  }
 }
 return true;
}

export function createVaultMutationGate({
 authenticateRequest,authorizeMutation,authorizeOperation,
 assertTrustedTransport,expectedOrigin
}={}){
 if(typeof authenticateRequest!=="function" ||
    typeof authorizeMutation!=="function" ||
    typeof authorizeOperation!=="function" ||
    typeof assertTrustedTransport!=="function" ||
    typeof expectedOrigin!=="string" ||
    !/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?$/.test(expectedOrigin))
   throw new TypeError("vault_mutation_gate_dependencies_required");

 return async function authorizeRequestMutation(req){
  if(!MUTATIONS.has(req?.method) || !uniqueHeaders(req))return false;
  if(req.headers?.origin!==expectedOrigin ||
     typeof req.headers?.["x-csrf-token"]!=="string")return false;
  const credential=extractVaultCookie(req);
  if(!credential)return false;

  try{
   // Trust transport assertions only from a locally configured server adapter,
   // never from X-Forwarded-Proto or any client-controlled request property.
   if(await assertTrustedTransport(req)!==true)return false;
   const context=await authenticateRequest(req);
   if(!context || Object.isFrozen(context)!==true)return false;
   const csrfOk=await authorizeMutation({
    credential,origin:req.headers.origin,expectedOrigin,
    csrfHeader:req.headers["x-csrf-token"]
   });
   if(csrfOk!==true)return false;
   // A separate trusted policy checks WRITE authorization, not merely READ.
   return await authorizeOperation({request:req,context})===true;
  }catch{
   return false;
  }
 };
}
