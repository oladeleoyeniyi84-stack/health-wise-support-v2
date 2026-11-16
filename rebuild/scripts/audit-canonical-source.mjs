/**
 * Read-only canonical app source preflight.
 * Reports missing root entrypoints without accessing production, secrets, or providers.
 * A healthy Engineering Vault preview MUST NOT be interpreted as a deployable app.
 */
import {readFile, stat} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve,join} from "node:path";

const repoRoot=resolve(fileURLToPath(new URL("../../",import.meta.url)));
async function fileExists(relative){
  try{return (await stat(join(repoRoot,relative))).isFile();}
  catch(error){if(error.code==="ENOENT")return false;throw error;}
}
export async function inspectCanonicalSource(){
  let manifest;
  try{manifest=JSON.parse(await readFile(join(repoRoot,"package.json"),"utf8"));}
  catch{return {status:"NO_GO",scope:"canonical-root-source",missing:["package.json"],reason:"root_manifest_unavailable"};}
  const scripts=manifest.scripts||{};
  const entries=[
    {id:"root_package",path:"package.json"},
    {id:"server_entrypoint",path:"server/index.ts"},
    {id:"migration_config",path:"drizzle.config.ts"},
    {id:"dependency_lockfile",path:"package-lock.json"},
    {id:"client_entrypoint",path:"client/src/main.tsx"},
    {id:"vite_config",path:"vite.config.ts"}
  ];
  const results=await Promise.all(entries.map(async item=>({...item,exists:await fileExists(item.path)})));
  const absent=results.filter(x=>!x.exists).map(x=>x.path);
  const scriptsMatch=typeof scripts.build==="string" &&
    scripts.build.includes("server/index.ts") &&
    typeof scripts.start==="string" &&
    scripts.start.includes("dist/index.js");
  const reasons=[];
  if(absent.length)reasons.push("required_source_files_missing");
  if(!scriptsMatch)reasons.push("legacy_build_scripts_not_verified");
  // No filesystem-only audit can verify production config, database ownership,
  // dependency install, actual build, startup, migrations, or identity.
  return Object.freeze({
    status:"NO_GO",scope:"canonical-root-source",files:results,missing:absent,
    scriptsMatchExpectedLegacyContract:scriptsMatch,
    reasons:[...reasons,"runtime_and_data_ownership_unverified"],
    previewOnly:true,productionBuildVerified:false
  });
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await inspectCanonicalSource();
 console.log(JSON.stringify(result,null,2));
}
