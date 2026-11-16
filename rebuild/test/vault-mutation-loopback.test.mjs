/** Test-only, loopback HTTP boundary. NEVER register this route in production. */
import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {randomBytes,createHmac} from "node:crypto";
import {createSignedSessionVerifier} from "../src/integrations/signed-session-verifier.mjs";
import {createVaultRequestAuthorizer,VAULT_COOKIE_NAME}
 from "../src/integrations/vault-request-auth.mjs";
import {createVaultSessionLifecycle}
 from "../src/integrations/vault-session-lifecycle.mjs";
import {createVaultMutationGate}
 from "../src/integrations/vault-mutation-gate.mjs";

test("parallel localhost mutations execute only after auth, CSRF and write policy",async()=>{
 const key=randomBytes(32), origin="https://healthwisesupport.test";
 const users=new Map([["session_alice_0001","member_alice"],["session_bobby_0002","member_bobby"]]);
 const records=new Map([["record_alice","member_alice"],["record_bobby","member_bobby"]]);
 const token=id=>"v1."+id+"."+createHmac("sha256",key)
  .update("healthwise.session.v1:"+id).digest("base64url");
 const csrf=id=>createHmac("sha256",key)
  .update("healthwise.csrf.v1:"+id).digest("base64url");
 const verifier=createSignedSessionVerifier({
  signingKey:key,
  loadSessionRecord:async id=>users.has(id)?{
   sessionId:id,subjectId:users.get(id),revoked:false,
   expiresAt:new Date("2035-01-01T00:00:00Z")
  }:null
 });
 const lifecycle=createVaultSessionLifecycle({
  signingKey:key,verifySignedSession:verifier,
  requireAuthenticatedPrincipal:async()=>{throw Error("issuance disabled");},
  store:{createSession:async()=>false,rotateSession:async()=>false,revokeSession:async()=>false}
 });
 const authenticate=createVaultRequestAuthorizer({
  verifySignedSession:verifier,
  pool:{query:async(_sql,[recordId,sessionId])=>{
   await new Promise(resolve=>setTimeout(resolve,sessionId==="session_alice_0001"?12:1));
   return {rowCount:1,rows:[{allowed:records.get(recordId)===users.get(sessionId)}]};
  }}
 });
 let executed=0;
 const guard=createVaultMutationGate({
  authenticateRequest:authenticate,
  authorizeMutation:lifecycle.authorizeMutation,
  // Test-only trusted-transport assertion, since this server is loopback HTTP.
  assertTrustedTransport:async()=>true,
  expectedOrigin:origin,
  authorizeOperation:async({request,context})=>{
   const path=new URL(request.url,"http://localhost").pathname;
   const id=path.split("/").pop();
   // The fixture's separate write grant is required in addition to owner read.
   const writeGrants=new Set(["record_alice","record_bobby"]);
   return writeGrants.has(id) &&
    await context.mayReadOwnedRecord({recordId:id});
  }
 });
 const server=createServer(async(req,res)=>{
  if(req.method!=="POST" || !req.url.startsWith("/vault-mutation-test/")){
   res.writeHead(404);res.end();return;
  }
  const allowed=await guard(req);
  if(allowed)executed++;
  res.writeHead(allowed?204:403,{"Cache-Control":"no-store"});
  res.end();
 });
 await new Promise((resolve,reject)=>{
  server.once("error",reject);
  server.listen(0,"127.0.0.1",resolve);
 });
 try{
  assert.equal(server.address().address,"127.0.0.1");
  const base="http://127.0.0.1:"+server.address().port;
  const hit=async(record,id,extras={})=>{
   const headers={Origin:origin,"X-CSRF-Token":csrf(id),
    Cookie:VAULT_COOKIE_NAME+"="+token(id),...extras};
   const response=await fetch(base+"/vault-mutation-test/"+record,{
    method:"POST",headers,redirect:"manual",signal:AbortSignal.timeout(3000)
   });
   return response.status;
  };
  const statuses=await Promise.all([
   hit("record_alice","session_alice_0001"),
   hit("record_bobby","session_bobby_0002"),
   hit("record_bobby","session_alice_0001"),
   hit("record_alice","session_bobby_0002"),
   hit("record_alice","session_alice_0001",{"X-CSRF-Token":"A".repeat(43)}),
   hit("record_alice","session_alice_0001",{Origin:"https://evil.example"}),
   hit("record_alice","session_alice_0001",{Cookie:""})
  ]);
  assert.deepEqual(statuses,[204,204,403,403,403,403,403]);
  assert.equal(executed,2,"denied requests must never invoke test mutation");
 }finally{
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});
