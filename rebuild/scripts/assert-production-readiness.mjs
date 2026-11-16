/**
 * Healthwise production-release guard.
 *
 * A legacy file inventory or green Engineering Vault preview does not establish
 * deployability. Deny until a separately reviewed, signed-off production evidence
 * manifest is introduced. This script must NOT accept browser-provided flags,
 * environment bypasses, or ad-hoc approval variables.
 */
import {inspectCanonicalSource} from "./audit-canonical-source.mjs";

export async function evaluateProductionReadiness(){
  const source=await inspectCanonicalSource();
  const unmet=[
    "historical_data_ownership_and_preservation",
    "reviewed_canonical_backend_and_clean_build",
    "server_owned_authentication_and_authorization",
    "isolated_database_and_migration_recovery",
    "private_storage_and_retention",
    "hosted_https_logging_and_abuse_controls",
    "stripe_testmode_provider_reconciliation",
    "exact_head_ci_security_staging_and_founder_signoff"
  ];
  if(source.missing?.length)unmet.unshift("legacy_source_files_missing");
  return Object.freeze({
    allowed:false,
    decision:"NO_GO",
    reason:"release_evidence_not_verified",
    source,
    unmet,
    vault:"enforced"
  });
}

if(import.meta.url === new URL("file://"+process.argv[1]).href){
  const report=await evaluateProductionReadiness();
  console.log(JSON.stringify(report,null,2));
  process.exitCode=2;
}
