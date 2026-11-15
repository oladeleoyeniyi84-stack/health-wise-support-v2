import test from "node:test";
import assert from "node:assert/strict";
import {createTrustedReviewRevocationAuthorizer} from "../src/integrations/stripe-v2-trusted-review-admin.mjs";
import {revokeSandboxReviewerAccess} from "../src/integrations/stripe-v2-review-revocation.mjs";
const identity="trusted_admin";
const session=()=>({operatorId:identity,verifiedByServer:true,revoked:false,
  expiresAt:new Date("2030-01-01T00:00:00.000Z")});
const grant=()=>({operatorId:identity,active:true,
  permission:"healthwise.checkout.review_access.revoke"});
const now=()=>new Date("2026-11-15T00:00:00.000Z");
const build=(s=session(),g=grant())=>createTrustedReviewRevocationAuthorizer({
  loadVerifiedServerSession:async()=>s,
  lookupActiveAdministratorGrant:async()=>g,now
});
test("trusted server-owned session and independent exact grant authorize",async()=>{
 assert.equal(await build()(),true);
});
test("unverified, revoked, expired and mismatched identities fail closed",async()=>{
 for(const s of [{...session(),verifiedByServer:false},{...session(),revoked:true},
  {...session(),expiresAt:new Date("2020-01-01")},{...session(),operatorId:"?"},null]){
  let grantReads=0;
  const authorize=createTrustedReviewRevocationAuthorizer({
   loadVerifiedServerSession:async()=>s,
   lookupActiveAdministratorGrant:async()=>{grantReads++;return grant();},now
  });
  await assert.rejects(authorize(),/review_admin_forbidden/);
  assert.equal(grantReads,0);
 }
});
test("wrong grant, inactive grant, wrong operator and unrelated permission denied",async()=>{
 for(const g of [{...grant(),operatorId:"other"},{...grant(),active:false},
  {...grant(),permission:"healthwise.checkout.review_evidence"},null]){
  await assert.rejects(build(session(),g)(),/review_admin_forbidden/);
 }
});
test("session or authorization-store outage never falls back to approval",async()=>{
 const authorize=createTrustedReviewRevocationAuthorizer({
  loadVerifiedServerSession:async()=>session(),
  lookupActiveAdministratorGrant:async()=>{throw new Error("grant_store_unavailable");},
  now
 });
 await assert.rejects(authorize(),/grant_store_unavailable/);
});
test("denied administrator cannot acquire a revocation DB connection",async()=>{
 let connections=0;
 await assert.rejects(revokeSandboxReviewerAccess({
  pool:{connect:async()=>{connections++;throw Error("unreachable");}},
  operatorId:"review_staff",sessionId:"trusted_session_0001",
  authorizeAdministrator:build(session(),{...grant(),active:false})
 }),/review_admin_forbidden/);
 assert.equal(connections,0);
});
