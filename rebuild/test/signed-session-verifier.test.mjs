import test from "node:test";
import assert from "node:assert/strict";
import {createHmac,randomBytes} from "node:crypto";
import {createSignedSessionVerifier} from "../src/integrations/signed-session-verifier.mjs";

const key=randomBytes(32),sessionId="isolated_session_0001";
const clock=Date.parse("2026-11-16T12:00:00Z");
const sign=(id=sessionId,secret=key)=>
  "v1."+id+"."+createHmac("sha256",secret)
    .update("healthwise.session.v1:"+id).digest("base64url");
const record=()=>({sessionId,subjectId:"member_001",revoked:false,
 expiresAt:new Date(clock+60_000)});
const verifier=(loadSessionRecord=async()=>record())=>
 createSignedSessionVerifier({signingKey:key,loadSessionRecord,now:()=>clock});

test("valid server-signed credential and independently loaded session authenticate",async()=>{
 const verified=await verifier()(sign());
 assert.equal(verified.sessionId,sessionId);
 assert.equal(verified.subjectId,"member_001");
 assert.equal(verified.serverVerified,true);
 assert.equal(Object.isFrozen(verified),true);
});

test("tampering and signatures from a different key never reach session store",async()=>{
 let reads=0;
 const check=verifier(async()=>{reads++;return record();});
 const token=sign();
 for(const bad of [undefined,null,"",sessionId,
  sign(sessionId,randomBytes(32)),
  token.replace("isolated_session_0001","isolated_session_0002"),
  token.slice(0,-1)+"!",token+"x",
  "v1."+sessionId+"."+("A".repeat(43)),{"token":token}]){
  assert.equal(await check(bad),null);
 }
 assert.equal(reads,0);
});

test("revoked, expired, mismatched and invalid session records fail closed",async()=>{
 for(const bad of [
  {...record(),revoked:true},{...record(),expiresAt:new Date(clock)},
  {...record(),sessionId:"different_session_0001"},
  {...record(),subjectId:"../../admin"},
  {...record(),expiresAt:"2099-01-01"},null
 ]){
  assert.equal(await verifier(async()=>bad)(sign()),null);
 }
});

test("session store failure and invalid clock fail closed",async()=>{
 assert.equal(await verifier(async()=>{throw Error("offline");})(sign()),null);
 const invalid=createSignedSessionVerifier({
  signingKey:key,loadSessionRecord:async()=>record(),now:()=>NaN
 });
 assert.equal(await invalid(sign()),null);
});

test("unsafe or missing trust dependencies refuse initialization",()=>{
 assert.throws(()=>createSignedSessionVerifier(),/trusted_signed_session_dependencies_required/);
 assert.throws(()=>createSignedSessionVerifier({
  signingKey:Buffer.alloc(16),loadSessionRecord:async()=>record()
 }),/trusted_signed_session_dependencies_required/);
});
