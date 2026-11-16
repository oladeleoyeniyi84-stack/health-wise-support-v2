/** Isolated copy test: malformed provenance must block candidate packaging. */
import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,copyFile,writeFile,readdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const base=fileURLToPath(new URL("../",import.meta.url));
const files=[
 "scripts/build-candidate.mjs",
 "scripts/check-canonical-readiness.mjs",
 "candidate/server.mjs",
 "candidate/start.mjs",
 "candidate/canonical-readiness.json"
];
const safeEnv={...process.env};
for(const name of ["NODE_ENV","RENDER","PORT","HOST","HEALTHWISE_PUBLIC_RELEASE"])
 delete safeEnv[name];

test("candidate build cannot package when data provenance contract becomes invalid",async()=>{
 const temp=await mkdtemp(join(tmpdir(),"healthwise-candidate-gate-"));
 try{
  for(const path of files){
   await mkdir(join(temp,path.split("/")[0]),{recursive:true});
   await copyFile(join(base,path),join(temp,path));
  }
  await writeFile(join(temp,"package.json"),'{"type":"module","private":true}\n');
  const script=join(temp,"scripts/build-candidate.mjs");
  const ready=spawnSync(process.execPath,[script],{env:safeEnv,encoding:"utf8",timeout:5000});
  assert.equal(ready.status,0,ready.stderr);
  assert.ok((await readdir(join(temp,"dist-candidate"))).includes("server.mjs"));
  for(const broken of [
   "{not json",
   JSON.stringify({schemaVersion:1,scope:"production",releaseDecision:"GO"}),
   JSON.stringify({schemaVersion:1,scope:"engineering-vault",releaseDecision:"NO_GO",
      canonicalProductionBackendSelected:true})
  ]){
   await writeFile(join(temp,"candidate/canonical-readiness.json"),broken);
   const denied=spawnSync(process.execPath,[script],{env:safeEnv,encoding:"utf8",timeout:5000});
   assert.notEqual(denied.status,0,"invalid provenance must block build");
   // Rejected builds do not overwrite or delete the existing safe artifact.
   assert.ok((await readdir(join(temp,"dist-candidate"))).includes("server.mjs"));
  }
 }finally{
  await rm(temp,{recursive:true,force:true});
 }
});
