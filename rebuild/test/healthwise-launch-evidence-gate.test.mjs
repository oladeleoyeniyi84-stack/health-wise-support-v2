import test from "node:test";
import assert from "node:assert/strict";
import {evaluateHealthwiseLaunchEvidence as evaluate,REQUIRED_RELEASE_GATES as ids} from "../src/integrations/healthwise-launch-evidence-gate.mjs";
const head="a".repeat(40);
const proof={verified:true,reviewer:"security_reviewer",verifiedAt:"2026-11-14T20:00:00Z",
 evidence:["https://github.com/example/repo/actions/runs/123"],headSha:head};
test("missing evidence blocks all seven launch gates",()=>{
 const result=evaluate();
 assert.equal(result.verifiedCount,0);
 assert.equal(result.missing.length,7);
 assert.equal(result.deploymentAuthorized,false);
});
test("claims without independently linked evidence never count",()=>{
 const gates=Object.fromEntries(ids.map(id=>[id,{...proof,evidence:[]}]));
 assert.equal(evaluate({gates,reviewedHeadSha:head}).verifiedCount,0);
});
test("stale commit evidence cannot satisfy current-head review",()=>{
 const gates=Object.fromEntries(ids.map(id=>[id,proof]));
 assert.equal(evaluate({gates,reviewedHeadSha:"b".repeat(40)}).verifiedCount,0);
});
test("a complete synthetic evidence register remains release-blocked",()=>{
 const gates=Object.fromEntries(ids.map(id=>[id,proof]));
 const result=evaluate({gates,reviewedHeadSha:head});
 assert.equal(result.evidenceReviewComplete,true);
 assert.equal(result.verifiedCount,7);
 assert.equal(result.release,"blocked");
 assert.equal(result.checkoutEnabled,false);
 assert.equal(result.deploymentAuthorized,false);
});
test("invalid or insecure evidence references do not count",()=>{
 const gates={[ids[0]]:{...proof,evidence:["http://example.com/log"]}};
 assert.equal(evaluate({gates,reviewedHeadSha:head}).verifiedCount,0);
});
