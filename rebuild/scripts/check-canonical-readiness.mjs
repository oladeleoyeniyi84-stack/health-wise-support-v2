/**
 * Engineering Vault source-of-truth guard.
 * This checks that the proposed canonical application is explicitly BLOCKED
 * while provenance, identity, recovery and release evidence are unresolved.
 * It does not grant approval if all fields change; any future promotion needs
 * a separately reviewed release mechanism and founder authorization.
 */
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
const path=fileURLToPath(new URL("../candidate/canonical-readiness.json",import.meta.url));
const keys={
 historicalData:[
  "ownerVerified","hostingProviderVerified","databaseLocationVerified",
  "recordInventoryVerified","retentionAndPrivacyObligationsReviewed",
  "immutablePreservationEvidenceVerified","isolatedRestoreVerified"
 ],
 application:[
  "legacyBackendEntryVerified","cleanFullStackBuildVerified",
  "trustedIdentityProviderIntegrated","ownedDatabaseProvisionedAndApproved",
  "migrationsReviewedAndVerified","privateDurableMediaVerified","stagingSecurityVerified"
 ],
 approvals:["costAndInfrastructure","migration","founderPublicRelease"]
};
export function inspectCandidateReadiness(value){
 if(!value || typeof value!=="object" || Array.isArray(value) ||
    value.schemaVersion!==1 || value.scope!=="engineering-vault" ||
    value.releaseDecision!=="NO_GO" ||
    value.canonicalProductionBackendSelected!==false)
   throw new Error("candidate_release_contract_invalid");
 const unresolved=[];
 for(const [group,fields] of Object.entries(keys)){
  if(!value[group] || typeof value[group]!=="object")throw new Error("candidate_evidence_section_missing:"+group);
  for(const field of fields){
   const state=value[group][field];
   if(typeof state!=="boolean")throw new Error("candidate_evidence_state_invalid:"+group+"."+field);
   if(state!==true)unresolved.push(group+"."+field);
  }
 }
 return Object.freeze({
  decision:"NO_GO",
  safeToPublish:false,
  safeToMigrate:false,
  productionBackendVerified:false,
  unresolved:Object.freeze(unresolved)
 });
}
export async function inspectCommittedCandidateReadiness(){
 return inspectCandidateReadiness(JSON.parse(await readFile(path,"utf8")));
}
if(process.argv[1] && fileURLToPath(new URL("file://"+process.argv[1]))===fileURLToPath(import.meta.url)){
 console.log(JSON.stringify(await inspectCommittedCandidateReadiness(),null,2));
}
