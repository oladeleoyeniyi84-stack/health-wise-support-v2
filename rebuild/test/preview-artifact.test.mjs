import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readdir, readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {join} from "node:path";

const root=fileURLToPath(new URL("../",import.meta.url));
const script=fileURLToPath(new URL("../scripts/build-preview.mjs",import.meta.url));
const cleanEnv={...process.env};
for(const key of ["NODE_ENV","RENDER","PORT","HOST","HEALTHWISE_PUBLIC_RELEASE"])delete cleanEnv[key];

async function enumerate(dir,prefix=""){
 const result=[];
 for(const entry of await readdir(dir,{withFileTypes:true})){
   assert.ok(!entry.isSymbolicLink(),"artifact may not contain symlinks");
   const relative=prefix+entry.name;
   if(entry.isDirectory())result.push(...await enumerate(join(dir,entry.name),relative+"/"));
   else{assert.ok(entry.isFile());result.push(relative);}
 }
 return result;
}

test("offline artifact contains only a strict public-preview allowlist",async()=>{
 const run=spawnSync(process.execPath,[script],{env:cleanEnv,encoding:"utf8",timeout:5000});
 assert.equal(run.status,0,run.stderr);
 const dest=join(root,"dist-preview");
 assert.deepEqual((await enumerate(dest)).sort(),[
   "package.json",
   "src/domain/consultations.mjs",
   "src/domain/public-catalog.mjs",
   "src/preview-page.mjs",
   "src/server.mjs"
 ].sort());
 const manifest=JSON.parse(await readFile(join(dest,"package.json"),"utf8"));
 assert.equal(manifest.private,true);
 assert.equal(manifest.type,"module");
 assert.equal(manifest.scripts,undefined);
});

test("build refuses production and hosting environment signals without deleting safe artifact",async()=>{
 const dest=join(root,"dist-preview");
 const manifestBefore=await readFile(join(dest,"package.json"),"utf8");
 for(const [key,value] of [
   ["NODE_ENV","production"],["RENDER","false"],["PORT","10000"],
   ["HOST","0.0.0.0"],["HEALTHWISE_PUBLIC_RELEASE","false"]
 ]){
   const run=spawnSync(process.execPath,[script],{
     env:{...cleanEnv,[key]:value},encoding:"utf8",timeout:5000
   });
   assert.notEqual(run.status,0,key);
   assert.match(run.stderr,/engineering_preview_build_production_forbidden/,key);
   assert.equal(await readFile(join(dest,"package.json"),"utf8"),manifestBefore,key);
 }
});
