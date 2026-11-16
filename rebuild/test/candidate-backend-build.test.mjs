import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readdir,readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {join} from "node:path";
import {createServer} from "node:net";
const root=fileURLToPath(new URL("../",import.meta.url));
const build=fileURLToPath(new URL("../scripts/build-candidate.mjs",import.meta.url));
const safeEnv={...process.env};
for(const name of ["NODE_ENV","RENDER","PORT","HOST","HEALTHWISE_PUBLIC_RELEASE"])
 delete safeEnv[name];
test("candidate artifact is allowlisted, reproducible, private and isolated",async()=>{
 const p=spawnSync(process.execPath,[build],{env:safeEnv,encoding:"utf8",timeout:5000});
 assert.equal(p.status,0,p.stderr);
 const dir=join(root,"dist-candidate");
 assert.deepEqual((await readdir(dir)).sort(),["package.json","server.mjs","start.mjs"]);
 const packageJson=JSON.parse(await readFile(join(dir,"package.json"),"utf8"));
 assert.equal(packageJson.private,true);
 assert.equal(packageJson.scripts.start,"node start.mjs");
 assert.equal(packageJson.dependencies,undefined);
 const {createCandidateBackend}=await import("../dist-candidate/server.mjs");
 const server=createCandidateBackend();
 try{
  await new Promise((resolve,reject)=>{
   server.once("error",reject);
   server.listen(0,"127.0.0.1",resolve);
  });
  const addr=server.address();
  assert.equal(addr.address,"127.0.0.1");
  const origin="http://127.0.0.1:"+addr.port;
  const get=async(path,method="GET")=>fetch(origin+path,{
   method,redirect:"manual",signal:AbortSignal.timeout(3000)
  });
  const health=await get("/health");
  assert.equal(health.status,200);
  assert.equal((await health.json()).release,"blocked");
  for(const path of ["/","/api/auth/login","/api/checkout","/api/consultations","/admin"]){
   for(const method of ["GET","POST"]){
    const result=await get(path,method);
    assert.equal(result.status,503,method+" "+path);
    assert.equal((await result.json()).error,"engineering_vault_unreleased");
   }
  }
 }finally{
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});
test("candidate build refuses hosting/production indicators",()=>{
 for(const [key,value] of [
  ["NODE_ENV","production"],["RENDER","false"],["PORT","3000"],
  ["HOST","0.0.0.0"],["HEALTHWISE_PUBLIC_RELEASE","false"]
 ]){
  const p=spawnSync(process.execPath,[build],{
   env:{...safeEnv,[key]:value},encoding:"utf8",timeout:5000
  });
  assert.notEqual(p.status,0,key);
  assert.match(p.stderr,/candidate_build_production_forbidden/);
 }
});
