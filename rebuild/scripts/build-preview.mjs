/**
 * Engineering Vault only: create a minimal, offline, non-deployable preview artifact.
 * Allowlist explicitly excludes checkout, auth, provider and database modules.
 */
import {copyFile, mkdir, rm, readFile, lstat} from "node:fs/promises";
import {join, dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(fileURLToPath(new URL("../",import.meta.url)));
const dest=join(root,"dist-preview");
if(process.env.NODE_ENV==="production" || process.env.RENDER!==undefined ||
   process.env.PORT || process.env.HOST || process.env.HEALTHWISE_PUBLIC_RELEASE!==undefined){
  throw new Error("engineering_preview_build_production_forbidden");
}
const files=[
  "src/server.mjs",
  "src/preview-page.mjs",
  "src/domain/public-catalog.mjs",
  "src/domain/consultations.mjs"
];
await rm(dest,{recursive:true,force:true});
for(const file of files){
  const source=join(root,file);
  const stat=await lstat(source);
  if(!stat.isFile() || stat.isSymbolicLink())throw new Error("invalid_preview_source:"+file);
  await mkdir(dirname(join(dest,file)),{recursive:true});
  await copyFile(source,join(dest,file));
}
const manifest={name:"healthwise-vault-preview-artifact",private:true,type:"module",
  description:"Offline loopback-only preview; never deploy or publish"};
await readFile(join(dest,"src/server.mjs"),"utf8");
await import("node:fs/promises").then(({writeFile})=>writeFile(join(dest,"package.json"),JSON.stringify(manifest,null,2)+"\n"));
console.log("PASS: isolated preview artifact assembled from explicit safe-file allowlist");
