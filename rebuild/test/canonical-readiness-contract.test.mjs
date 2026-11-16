import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {inspectCandidateReadiness,inspectCommittedCandidateReadiness}
 from "../scripts/check-canonical-readiness.mjs";

test("unverified historical ownership and release evidence keep canonical app blocked",async()=>{
 const result=await inspectCommittedCandidateReadiness();
 assert.equal(result.decision,"NO_GO");
 assert.equal(result.safeToPublish,false);
 assert.equal(result.safeToMigrate,false);
 assert.equal(result.productionBackendVerified,false);
 for(const key of [
  "historicalData.ownerVerified",
  "historicalData.immutablePreservationEvidenceVerified",
  "historicalData.isolatedRestoreVerified",
  "application.trustedIdentityProviderIntegrated",
  "application.cleanFullStackBuildVerified",
  "approvals.founderPublicRelease"
 ])assert.ok(result.unresolved.includes(key));
 assert.equal(Object.isFrozen(result),true);
});

test("client-like approval assertions cannot change the release decision",async()=>{
 const {readFile}=await import("node:fs/promises");
 const manifest=JSON.parse(await readFile(new URL("../candidate/canonical-readiness.json",import.meta.url),"utf8"));
 const forged={...manifest,
  historicalData:Object.fromEntries(Object.keys(manifest.historicalData).map(k=>[k,true])),
  application:Object.fromEntries(Object.keys(manifest.application).map(k=>[k,true])),
  approvals:Object.fromEntries(Object.keys(manifest.approvals).map(k=>[k,true])),
  founderApproved:true,live:true,releaseAllowed:true
 };
 assert.equal(inspectCandidateReadiness(forged).safeToPublish,false);
 assert.equal(inspectCandidateReadiness(forged).safeToMigrate,false);
 for(const mutation of [
  {...forged,releaseDecision:"GO"},
  {...forged,canonicalProductionBackendSelected:true},
  {...forged,scope:"production"},
  {...forged,historicalData:{...forged.historicalData,ownerVerified:"true"}}
 ])assert.throws(()=>inspectCandidateReadiness(mutation),/candidate_/);
});

test("command line audit reports NO-GO without production credentials",()=>{
 const script=fileURLToPath(new URL("../scripts/check-canonical-readiness.mjs",import.meta.url));
 const result=spawnSync(process.execPath,[script],{
  env:{...process.env,FOUNDER_APPROVED:"true",HEALTHWISE_PUBLIC_RELEASE:"true"},
  encoding:"utf8",timeout:5000
 });
 assert.equal(result.status,0,result.stderr);
 const report=JSON.parse(result.stdout);
 assert.equal(report.safeToPublish,false);
 assert.equal(report.safeToMigrate,false);
 assert.ok(!("databaseUrl" in report));
});
