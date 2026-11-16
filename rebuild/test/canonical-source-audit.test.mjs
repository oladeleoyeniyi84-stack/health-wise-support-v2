import test from "node:test";
import assert from "node:assert/strict";
import {inspectCanonicalSource} from "../scripts/audit-canonical-source.mjs";

test("legacy root app is never mistaken for verified production build",async()=>{
 const report=await inspectCanonicalSource();
 assert.equal(report.status,"NO_GO");
 assert.equal(report.scope,"canonical-root-source");
 assert.equal(report.productionBuildVerified,false);
 assert.equal(report.previewOnly,true);
 assert.ok(report.reasons.includes("runtime_and_data_ownership_unverified"));
 assert.ok(Array.isArray(report.files));
 assert.equal(report.files.find(item=>item.id==="root_package")?.exists,true);
 assert.equal(report.files.find(item=>item.id==="client_entrypoint")?.exists,true);
 assert.equal(report.files.find(item=>item.id==="vite_config")?.exists,true);
 assert.deepEqual(report.missing.sort(),[
   "server/index.ts","drizzle.config.ts","package-lock.json"
 ].sort());
 assert.equal(report.scriptsMatchExpectedLegacyContract,true);
});

test("source readiness is not a deployment or data-ownership attestation",async()=>{
 const report=await inspectCanonicalSource();
 assert.equal(report.productionBuildVerified,false);
 assert.ok(!("databaseUrl" in report));
 assert.ok(!("credentials" in report));
 assert.ok(!("customerRecords" in report));
});
