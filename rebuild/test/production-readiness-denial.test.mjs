import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {evaluateProductionReadiness} from "../scripts/assert-production-readiness.mjs";

test("release is denied even if the Engineering Vault preview builds",async()=>{
 const report=await evaluateProductionReadiness();
 assert.equal(report.allowed,false);
 assert.equal(report.decision,"NO_GO");
 assert.equal(report.vault,"enforced");
 assert.ok(report.unmet.includes("server_owned_authentication_and_authorization"));
 assert.ok(report.unmet.includes("historical_data_ownership_and_preservation"));
 assert.ok(report.unmet.includes("exact_head_ci_security_staging_and_founder_signoff"));
 assert.equal(report.source.productionBuildVerified,false);
});

test("release guard CLI exits nonzero even with asserted approval environment flags",()=>{
 const file=fileURLToPath(new URL("../scripts/assert-production-readiness.mjs",import.meta.url));
 for(const environment of [{},{HEALTHWISE_PUBLIC_RELEASE:"true",FOUNDER_APPROVED:"true",NODE_ENV:"production"}]){
  const result=spawnSync(process.execPath,[file],{
   env:{...process.env,...environment},encoding:"utf8",timeout:5000
  });
  assert.equal(result.status,2,result.stderr);
  const report=JSON.parse(result.stdout);
  assert.equal(report.allowed,false);
  assert.equal(report.decision,"NO_GO");
 }
});
