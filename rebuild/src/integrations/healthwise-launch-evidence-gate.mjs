/**
 * Engineering Vault launch gate. Evidence references are supplied only by
 * authorized reviewers after independent verification; this pure evaluator
 * neither verifies URLs nor grants deployment permission.
 */
export const REQUIRED_RELEASE_GATES=Object.freeze([
 "trusted_authentication","least_privilege_database","stripe_testmode_e2e",
 "production_restore_and_migration","private_durable_storage",
 "https_host_and_operations","staging_security_and_founder_approval"
]);
export function evaluateHealthwiseLaunchEvidence({gates,reviewedHeadSha}={}){
 const sha=/^[0-9a-f]{40}$/i;
 const validRef=/^https:\/\/[a-z0-9.-]+\/[A-Za-z0-9_./#?=&%-]+$/i;
 const results=REQUIRED_RELEASE_GATES.map(id=>{
  const item=gates?.[id];
  const evidence=Array.isArray(item?.evidence)?item.evidence:[];
  const complete=item?.verified===true &&
   typeof item?.reviewer==="string" && item.reviewer.trim().length>=3 &&
   typeof item?.verifiedAt==="string" && !Number.isNaN(Date.parse(item.verifiedAt)) &&
   evidence.length>0 && evidence.every(ref=>typeof ref==="string" && validRef.test(ref)) &&
   sha.test(reviewedHeadSha??"") && item?.headSha===reviewedHeadSha;
  return Object.freeze({id,verified:complete});
 });
 const verifiedCount=results.filter(x=>x.verified).length;
 return Object.freeze({release:"blocked",checkoutEnabled:false,
  verifiedCount,requiredCount:REQUIRED_RELEASE_GATES.length,
  missing:Object.freeze(results.filter(x=>!x.verified).map(x=>x.id)),
  evidenceReviewComplete:verifiedCount===REQUIRED_RELEASE_GATES.length,
  // Completion of evidence review is never equivalent to release authorization.
  deploymentAuthorized:false});
}
