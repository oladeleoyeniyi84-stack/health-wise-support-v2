/**
 * Allowlisted candidate backend build, separate from the preview and root app.
 * Deny production/hosting environments, copy one offline source and private
 * manifest; never include secrets, historic data, auth or Stripe modules.
 */
import {lstat,mkdir,rm,copyFile,writeFile,readFile} from "node:fs/promises";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {inspectCommittedCandidateReadiness} from "./check-canonical-readiness.mjs";
const root=resolve(fileURLToPath(new URL("../",import.meta.url)));
const out=join(root,"dist-candidate");
if(process.env.NODE_ENV==="production" || process.env.RENDER!==undefined ||
   process.env.PORT!==undefined || process.env.HOST!==undefined ||
   process.env.HEALTHWISE_PUBLIC_RELEASE!==undefined)
 throw new Error("candidate_build_production_forbidden");
// Refuse packaging when the committed provenance/release contract is absent,
// malformed, or no longer explicitly locked to Engineering Vault NO-GO.
const decision=await inspectCommittedCandidateReadiness();
if(decision.decision!=="NO_GO" || decision.safeToPublish!==false ||
   decision.safeToMigrate!==false || decision.productionBackendVerified!==false)
 throw new Error("candidate_release_contract_not_blocked");
const source=join(root,"candidate/server.mjs");
const stat=await lstat(source);
if(!stat.isFile() || stat.isSymbolicLink())
 throw new Error("candidate_source_invalid");
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
await copyFile(source,join(out,"server.mjs"));
const startup=join(root,"candidate/start.mjs");
const startStat=await lstat(startup);
if(!startStat.isFile() || startStat.isSymbolicLink()) throw new Error("candidate_start_invalid");
await copyFile(startup,join(out,"start.mjs"));
const manifest={
 name:"healthwise-candidate-backend-vault",version:"0.0.0",
 private:true,type:"module",
 description:"Offline loopback-only backend candidate; NOT deployable",
 scripts:{start:"node start.mjs"}
};
await writeFile(join(out,"package.json"),JSON.stringify(manifest,null,2)+"\n");
if(!(await readFile(join(out,"server.mjs"),"utf8")).includes("engineering_vault_unreleased"))
 throw new Error("candidate_release_deny_missing");
console.log("PASS: minimal independent candidate-backend build artifact");
