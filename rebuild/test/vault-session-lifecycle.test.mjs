import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {createSignedSessionVerifier} from "../src/integrations/signed-session-verifier.mjs";
import {createVaultSessionLifecycle,clearVaultSessionCookie}
 from "../src/integrations/vault-session-lifecycle.mjs";
const key=randomBytes(32),clock=Date.parse("2026-11-16T12:00:00Z");
function setup({failCreate=false,failRotate=false,failRevoke=false,badPrincipal=false}={}){
 const rows=new Map();
 const store={
  async createSession(row){
   if(failCreate)return false;
   assert.ok(!rows.has(row.sessionId));
   rows.set(row.sessionId,{...row});return true;
  },
  async rotateSession({oldSessionId,newSessionId,subjectId,expiresAt}){
   if(failRotate)return false;
   const old=rows.get(oldSessionId);
   if(!old||old.revoked||old.subjectId!==subjectId||old.expiresAt.getTime()<=clock)return false;
   old.revoked=true;
   rows.set(newSessionId,{sessionId:newSessionId,subjectId,expiresAt,revoked:false});
   return true;
  },
  async revokeSession({sessionId}){
   if(failRevoke)return false;
   const row=rows.get(sessionId);
   if(!row||row.revoked)return false;
   row.revoked=true;return true;
  }
 };
 const verifier=createSignedSessionVerifier({
  signingKey:key,loadSessionRecord:async id=>rows.get(id)||null,now:()=>clock
 });
 const lifecycle=createVaultSessionLifecycle({
  signingKey:key,store,verifySignedSession:verifier,
  requireAuthenticatedPrincipal:async()=>badPrincipal?
   {subjectId:"member_alice",serverVerified:false}:
   {subjectId:"member_alice",serverVerified:true},
  now:()=>clock
 });
 return {rows,verifier,lifecycle};
}
const credential=result=>result.cookie.split(";")[0].split("=").slice(1).join("=");

test("trusted issuer creates a new random session and secure host-only cookie",async()=>{
 const {rows,verifier,lifecycle}=setup();
 const issued=await lifecycle.issue();
 assert.match(issued.cookie,/^__Host-healthwise_vault=v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=3600$/);
 assert.match(issued.csrfToken,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(rows.size,1);
 assert.equal((await verifier(credential(issued))).subjectId,"member_alice");
 const second=await lifecycle.issue();
 assert.notEqual(credential(second),credential(issued));
});
test("atomic rotation invalidates old credentials and rotates CSRF secret",async()=>{
 const {lifecycle,verifier}=setup();
 const old=await lifecycle.issue();
 const current=await lifecycle.rotate(credential(old));
 assert.ok(current);
 assert.notEqual(credential(current),credential(old));
 assert.notEqual(current.csrfToken,old.csrfToken);
 assert.equal(await verifier(credential(old)),null);
 assert.equal((await verifier(credential(current))).subjectId,"member_alice");
 assert.equal(await lifecycle.rotate(credential(old)),null);
});
test("logout revokes session and clears cookie",async()=>{
 const {lifecycle,verifier}=setup();
 const current=await lifecycle.issue();
 const out=await lifecycle.logout(credential(current));
 assert.equal(out.revoked,true);
 assert.equal(out.cookie,clearVaultSessionCookie());
 assert.match(out.cookie,/Max-Age=0$/);
 assert.equal(await verifier(credential(current)),null);
 const unknown=await lifecycle.logout("forged");
 assert.equal(unknown.revoked,false);
});
test("mutation requires authenticated signed session, exact HTTPS Origin and CSRF header",async()=>{
 const {lifecycle}=setup();
 const issued=await lifecycle.issue(),token=credential(issued);
 const req={credential:token,origin:"https://healthwisesupport.com",
  expectedOrigin:"https://healthwisesupport.com",csrfHeader:issued.csrfToken};
 assert.equal(await lifecycle.authorizeMutation(req),true);
 for(const changed of [
  {csrfHeader:"A".repeat(43)},{csrfHeader:""},{csrfHeader:undefined},
  {origin:"https://evil.example"},
  {origin:"http://healthwisesupport.com"},
  {expectedOrigin:"http://healthwisesupport.com"},
  {credential:"forged"},
  {credential:undefined}
 ])assert.equal(await lifecycle.authorizeMutation({...req,...changed}),false);
 const rotated=await lifecycle.rotate(token);
 assert.equal(await lifecycle.authorizeMutation(req),false);
 assert.equal(await lifecycle.authorizeMutation({
  ...req,credential:credential(rotated),csrfHeader:rotated.csrfToken
 }),true);
});
test("issuance denied when trusted auth is absent or DB persistence fails",async()=>{
 await assert.rejects(setup({badPrincipal:true}).lifecycle.issue(),/vault_identity_required/);
 await assert.rejects(setup({failCreate:true}).lifecycle.issue(),/vault_session_creation_failed/);
 const {lifecycle}=setup({failRotate:true});
 const original=await lifecycle.issue();
 assert.equal(await lifecycle.rotate(credential(original)),null);
 const failed=setup({failRevoke:true});
 const current=await failed.lifecycle.issue();
 assert.equal((await failed.lifecycle.logout(credential(current))).revoked,false);
});
test("dependency validation prohibits anonymous issuer construction",()=>{
 assert.throws(()=>createVaultSessionLifecycle(),/vault_session_lifecycle_dependencies_required/);
});
