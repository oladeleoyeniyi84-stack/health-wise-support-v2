import test from "node:test";
import assert from "node:assert/strict";
import {createHmac,randomBytes} from "node:crypto";
import {createSignedSessionVerifier} from "../src/integrations/signed-session-verifier.mjs";
import {
 createVaultRequestAuthorizer,extractVaultCookie,VAULT_COOKIE_NAME,VAULT_COOKIE_POLICY
} from "../src/integrations/vault-request-auth.mjs";

const key=randomBytes(32),expiry=new Date("2035-01-01T00:00:00Z");
const subjects=new Map([["session_alice_0001","member_alice"],["session_bobby_0002","member_bobby"]]);
const signed=id=>"v1."+id+"."+createHmac("sha256",key)
 .update("healthwise.session.v1:"+id).digest("base64url");
const req=(token,extras={})=>({
 headers:{cookie:VAULT_COOKIE_NAME+"="+token,...extras}
});
const verify=createSignedSessionVerifier({
 signingKey:key,
 loadSessionRecord:async id=>subjects.has(id)?{
  sessionId:id,subjectId:subjects.get(id),revoked:false,expiresAt:expiry
 }:null
});
const ownerByRecord=new Map([["record_alice","member_alice"],["record_bobby","member_bobby"]]);
const queries=[];
const pool={query:async(_sql,[recordId,sessionId])=>{
 queries.push({recordId,sessionId});
 return {rowCount:1,rows:[{allowed:ownerByRecord.get(recordId)===subjects.get(sessionId)}]};
}};

test("host-prefixed cookie parser requires one strictly shaped credential",()=>{
 const a=signed("session_alice_0001");
 assert.equal(extractVaultCookie(req(a)),a);
 assert.equal(extractVaultCookie({headers:{cookie:"prefs=ok; "+VAULT_COOKIE_NAME+"="+a}}),a);
 for(const header of [
  VAULT_COOKIE_NAME+"="+a+"; "+VAULT_COOKIE_NAME+"="+a,
  VAULT_COOKIE_NAME+"=v1.bad.value",
  VAULT_COOKIE_NAME+"="+a+"\r\nX-Injected:1",
  VAULT_COOKIE_NAME+"="+a+"; broken",
  "another="+a,
  VAULT_COOKIE_NAME+"="+a+"; "+VAULT_COOKIE_NAME+"="+a+"x",
  "filler="+("z".repeat(4096))+"; "+VAULT_COOKIE_NAME+"="+a
 ])assert.equal(extractVaultCookie({headers:{cookie:header}}),null);
 assert.deepEqual(VAULT_COOKIE_POLICY,{
  secure:true,httpOnly:true,sameSite:"Strict",path:"/",hostOnly:true
 });
});

test("valid signed cookie creates immutable, request-local owner authorization",async()=>{
 queries.length=0;
 const authenticate=createVaultRequestAuthorizer({verifySignedSession:verify,pool});
 const context=await authenticate(req(signed("session_alice_0001")));
 assert.ok(context);
 assert.equal(Object.isFrozen(context),true);
 assert.equal(context.sessionId,undefined);
 assert.equal(context.subjectId,undefined);
 assert.equal(await context.mayReadOwnedRecord({recordId:"record_alice"}),true);
 assert.equal(await context.mayReadOwnedRecord({recordId:"record_bobby"}),false);
 assert.deepEqual(queries.map(q=>q.sessionId),[
  "session_alice_0001","session_alice_0001"
 ]);
});

test("forgery, missing cookie, client-declared identity and verifier outages fail closed",async()=>{
 const authenticate=createVaultRequestAuthorizer({verifySignedSession:verify,pool});
 const forged=signed("session_alice_0001").replace("session_alice_0001","session_bobby_0002");
 assert.equal(await authenticate(req(forged)),null);
 assert.equal(await authenticate({headers:{},body:{serverVerified:true,role:"admin"}}),null);
 assert.equal(await authenticate({headers:{authorization:"Bearer "+signed("session_alice_0001")}}),null);
 const down=createVaultRequestAuthorizer({
  verifySignedSession:async()=>{throw new Error("store offline");},pool
 });
 assert.equal(await down(req(signed("session_alice_0001"))),null);
 assert.throws(()=>createVaultRequestAuthorizer(),/vault_request_auth_dependencies_required/);
});

test("concurrent requests never inherit another user's authenticated session",async()=>{
 queries.length=0;
 const authenticate=createVaultRequestAuthorizer({
  verifySignedSession:async credential=>{
   const id=credential.includes("session_alice_0001")?"session_alice_0001":"session_bobby_0002";
   await new Promise(resolve=>setTimeout(resolve,id==="session_alice_0001"?15:1));
   return verify(credential);
  },
  pool:{query:async(sql,params)=>{
   await new Promise(resolve=>setTimeout(resolve,params[1]==="session_bobby_0002"?12:1));
   return pool.query(sql,params);
  }}
 });
 const [alice,bobby]=await Promise.all([
  authenticate(req(signed("session_alice_0001"))),
  authenticate(req(signed("session_bobby_0002")))
 ]);
 assert.ok(alice&&bobby);
 const [aOwn,bOwn,aOther,bOther]=await Promise.all([
  alice.mayReadOwnedRecord({recordId:"record_alice"}),
  bobby.mayReadOwnedRecord({recordId:"record_bobby"}),
  alice.mayReadOwnedRecord({recordId:"record_bobby"}),
  bobby.mayReadOwnedRecord({recordId:"record_alice"})
 ]);
 assert.deepEqual([aOwn,bOwn,aOther,bOther],[true,true,false,false]);
 assert.deepEqual(queries.map(q=>q.sessionId).sort(),[
  "session_alice_0001","session_alice_0001",
  "session_bobby_0002","session_bobby_0002"
 ]);
});
