/** Isolated loopback-only HTTP tests. This server is test code, not an app route. */
import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {createHmac,randomBytes} from "node:crypto";
import {createSignedSessionVerifier} from "../src/integrations/signed-session-verifier.mjs";
import {createVaultRequestAuthorizer,VAULT_COOKIE_NAME}
 from "../src/integrations/vault-request-auth.mjs";

test("real parallel loopback requests isolate signed-cookie owner reads",async()=>{
 const key=randomBytes(32);
 const sign=id=>"v1."+id+"."+createHmac("sha256",key)
  .update("healthwise.session.v1:"+id).digest("base64url");
 const users=new Map([["session_alice_0001","member_alice"],["session_bobby_0002","member_bobby"]]);
 const records=new Map([["record_alice","member_alice"],["record_bobby","member_bobby"]]);
 const verifier=createSignedSessionVerifier({
  signingKey:key,
  loadSessionRecord:async id=>{
   await new Promise(resolve=>setTimeout(resolve,id==="session_alice_0001"?12:1));
   return users.has(id)?{
    sessionId:id,subjectId:users.get(id),revoked:false,
    expiresAt:new Date("2035-01-01T00:00:00Z")
   }:null;
  }
 });
 const authorize=createVaultRequestAuthorizer({
  verifySignedSession:verifier,
  pool:{query:async(_sql,[recordId,sessionId])=>({
   rowCount:1,rows:[{allowed:records.get(recordId)===users.get(sessionId)}]
  })}
 });
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");
  if(req.method!=="GET" || url.pathname!=="/vault-owner-check"){
   res.writeHead(404);res.end();return;
  }
  const context=await authorize(req);
  const allowed=context?await context.mayReadOwnedRecord({
   recordId:url.searchParams.get("record")
  }):false;
  res.writeHead(allowed?204:403,{"Cache-Control":"no-store"});
  res.end();
 });
 await new Promise((resolve,reject)=>{
  server.once("error",reject);
  server.listen(0,"127.0.0.1",resolve);
 });
 try{
  const address=server.address();
  assert.equal(address.address,"127.0.0.1");
  const origin="http://127.0.0.1:"+address.port;
  const hit=(record,id)=>fetch(origin+"/vault-owner-check?record="+record,{
   headers:id?{Cookie:VAULT_COOKIE_NAME+"="+sign(id)}:{},
   redirect:"manual",signal:AbortSignal.timeout(3000)
  }).then(response=>response.status);
  const statuses=await Promise.all([
   hit("record_alice","session_alice_0001"),
   hit("record_bobby","session_bobby_0002"),
   hit("record_bobby","session_alice_0001"),
   hit("record_alice","session_bobby_0002"),
   hit("record_alice",null)
  ]);
  assert.deepEqual(statuses,[204,204,403,403,403]);
 }finally{
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});
