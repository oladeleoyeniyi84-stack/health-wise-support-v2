import test from "node:test";
import assert from "node:assert/strict";
import {createHmac,randomBytes} from "node:crypto";
import {createSignedSessionVerifier} from "../src/integrations/signed-session-verifier.mjs";
import {createVaultRestrictedMutationHandler}
 from "../src/integrations/vault-restricted-http-bridge.mjs";
import {VAULT_COOKIE_NAME} from "../src/integrations/vault-request-auth.mjs";

const key=randomBytes(32),origin="https://healthwisesupport.test";
const sessions=new Map([
 ["session_alice_0001","member_alice"],
 ["session_bobby_0002","member_bobby"]
]);
const sign=id=>"v1."+id+"."+createHmac("sha256",key)
 .update("healthwise.session.v1:"+id).digest("base64url");
const csrf=id=>createHmac("sha256",key)
 .update("healthwise.csrf.v1:"+id).digest("base64url");
function request(id,options={}){
 const headers={
  cookie:VAULT_COOKIE_NAME+"="+sign(id),origin,
  "x-csrf-token":csrf(id),...(options.headers||{})
 };
 return {
  method:options.method||"POST",headers,
  rawHeaders:["Cookie",headers.cookie,"Origin",headers.origin,
   "X-CSRF-Token",headers["x-csrf-token"]]
 };
}

test("write SQL is called only after trusted auth and CSRF; no cross-request session bleed",async()=>{
 const verified=createSignedSessionVerifier({
  signingKey:key,
  loadSessionRecord:async id=>sessions.has(id)?{
   sessionId:id,subjectId:sessions.get(id),revoked:false,
   expiresAt:new Date("2035-01-01T00:00:00Z")
  }:null
 });
 const calls=[];
 const pool={query:async(_sql,[sid,record,note])=>{
  await new Promise(resolve=>setTimeout(resolve,sid==="session_alice_0001"?15:1));
  calls.push([sid,record,note]);
  return {rowCount:1,rows:[{allowed:
    (sid==="session_alice_0001"&&record==="record_alice")||
    (sid==="session_bobby_0002"&&record==="record_bobby")
  }]};
 }};
 const handle=createVaultRestrictedMutationHandler({
  expectedOrigin:origin,pool,verifySignedSession:verified,
  authenticateRequest:async req=>{
   const token=req.headers.cookie.slice((VAULT_COOKIE_NAME+"=").length);
   const session=await verified(token);
   return session?Object.freeze({readOnly:true}):null;
  },
  assertTrustedTransport:async()=>true, // isolated test only
  authorizeMutation:async({credential,origin:given,csrfHeader})=>{
   const session=await verified(credential);
   return !!session && given===origin && csrfHeader===csrf(session.sessionId);
  }
 });
 const results=await Promise.all([
  handle(request("session_alice_0001"),{recordId:"record_alice",note:"A"}),
  handle(request("session_bobby_0002"),{recordId:"record_bobby",note:"B"}),
  handle(request("session_alice_0001"),{recordId:"record_bobby",note:"cross"}),
  handle(request("session_bobby_0002"),{recordId:"record_alice",note:"cross"}),
  handle(request("session_alice_0001",{headers:{"x-csrf-token":"A".repeat(43)}}),
   {recordId:"record_alice",note:"forged"}),
  handle(request("session_bobby_0002",{headers:{origin:"https://evil.example"}}),
   {recordId:"record_bobby",note:"other origin"})
 ]);
 assert.deepEqual(results,[true,true,false,false,false,false]);
 assert.equal(calls.length,4,"CSRF/origin denials never reach SQL");
 assert.deepEqual(calls.map(c=>c[0]+"|"+c[1]).sort(),[
  "session_alice_0001|record_alice","session_alice_0001|record_bobby",
  "session_bobby_0002|record_alice","session_bobby_0002|record_bobby"
 ].sort());
});

test("all missing trusted dependencies fail construction or closed",async()=>{
 assert.throws(()=>createVaultRestrictedMutationHandler(),/vault_restricted_http_dependencies_required/);
});
