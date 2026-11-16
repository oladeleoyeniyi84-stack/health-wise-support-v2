import test from "node:test";
import assert from "node:assert/strict";
import {createOwnerBoundReadGuard} from "../src/domain/owner-read-guard.mjs";
const CLOCK=Date.parse("2026-11-16T00:00:00.000Z");
const principal=()=>({
 subjectId:"member_123",serverVerified:true,revoked:false,
 expiresAt:new Date(CLOCK+60_000)
});
const guard=(value=principal())=>createOwnerBoundReadGuard({
 resolveVerifiedPrincipal:async()=>value,now:()=>CLOCK
});

test("only matching, current, server-verified principal may read its own record",async()=>{
 const result=await guard()({recordOwnerId:"member_123"});
 assert.deepEqual(result,{subjectId:"member_123",scope:"owner:read"});
 assert.equal(Object.isFrozen(result),true);
});

test("cross-account access fails even when principal is verified",async()=>{
 await assert.rejects(guard()({recordOwnerId:"member_other"}),/owner_read_forbidden/);
});

test("browser-like identity claims cannot authorize ownership",async()=>{
 for(const p of [
  {...principal(),serverVerified:false},
  {...principal(),serverVerified:"true"},
  {...principal(),revoked:true},
  {...principal(),expiresAt:new Date(CLOCK)},
  {...principal(),expiresAt:"2030-01-01"},
  {...principal(),subjectId:"bad/id"},
  null
 ])await assert.rejects(guard(p)({recordOwnerId:"member_123"}),/owner_read_forbidden/);
});

test("invalid owner identifiers and missing identity providers fail closed",async()=>{
 for(const owner of [undefined,null,"","../admin","member 123"]){
  await assert.rejects(guard()({recordOwnerId:owner}),/owner_read_forbidden/);
 }
 assert.throws(()=>createOwnerBoundReadGuard(),/trusted_identity_dependencies_required/);
});

test("server session verification outage never grants access",async()=>{
 const authorize=createOwnerBoundReadGuard({
  resolveVerifiedPrincipal:async()=>{throw new Error("session_store_down");},
  now:()=>CLOCK
 });
 await assert.rejects(authorize({recordOwnerId:"member_123"}),/owner_read_forbidden/);
});

test("untrusted request fields do not override independently resolved identity",async()=>{
 const authorize=guard({...principal(),subjectId:"member_other"});
 await assert.rejects(authorize({
  recordOwnerId:"member_123",serverVerified:true,
  role:"admin",subjectId:"member_123",verifiedByServer:true
 }),/owner_read_forbidden/);
});
