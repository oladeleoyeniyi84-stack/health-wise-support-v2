/** Actual startup-process smoke test for the retained Engineering Vault candidate.
 * Runs only on 127.0.0.1, with no external credentials or network calls.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const entry=fileURLToPath(new URL("../candidate/start.mjs",import.meta.url));
const safeEnv={...process.env};
for(const key of ["NODE_ENV","RENDER","PORT","HOST","HEALTHWISE_PUBLIC_RELEASE"])
 delete safeEnv[key];

test("real candidate startup binds loopback and keeps every application route blocked",async()=>{
 const child=spawn(process.execPath,[entry],{
  env:safeEnv,stdio:["ignore","pipe","pipe"]
 });
 let stdout="",stderr="";
 child.stdout.setEncoding("utf8");
 child.stderr.setEncoding("utf8");
 child.stdout.on("data",chunk=>{stdout+=chunk;});
 child.stderr.on("data",chunk=>{stderr+=chunk;});
 try{
  let port;
  const deadline=Date.now()+5000;
  while(Date.now()<deadline){
   const match=/Engineering Vault candidate listening only on 127\.0\.0\.1:(\d+)/.exec(stdout);
   if(match){port=Number(match[1]);break;}
   if(child.exitCode!==null)throw new Error("candidate_start_exited:"+stderr);
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.ok(Number.isInteger(port) && port>0,"candidate must report loopback ephemeral port");
  const origin="http://127.0.0.1:"+port;
  const health=await fetch(origin+"/health",{signal:AbortSignal.timeout(2000)});
  assert.equal(health.status,200);
  assert.equal((await health.json()).release,"blocked");
  assert.match(health.headers.get("x-robots-tag")||"",/noindex/);
  assert.equal(health.headers.get("cache-control"),"no-store");
  for(const path of ["/","/api/account","/api/auth/login","/api/checkout","/book","/admin"]){
   for(const method of ["GET","POST"]){
    const res=await fetch(origin+path,{method,signal:AbortSignal.timeout(2000)});
    assert.equal(res.status,503,method+" "+path);
    assert.equal((await res.json()).error,"engineering_vault_unreleased");
   }
  }
 }finally{
  child.kill("SIGTERM");
  // The isolated test must never leave a listening process behind.
  await new Promise(resolve=>{
   if(child.exitCode!==null || child.signalCode!==null)return resolve();
   const timer=setTimeout(resolve,1500);
   child.once("exit",()=>{clearTimeout(timer);resolve();});
  });
  if(child.exitCode===null && child.signalCode===null)child.kill("SIGKILL");
 }
});

test("actual candidate startup refuses hosting and release indicators",()=>{
 for(const [name,value] of [
  ["NODE_ENV","production"],["RENDER","false"],["PORT","3000"],
  ["HOST","0.0.0.0"],["HEALTHWISE_PUBLIC_RELEASE","false"]
 ]){
  const run=spawnSync(process.execPath,[entry],{
   env:{...safeEnv,[name]:value},encoding:"utf8",timeout:3000
  });
  assert.notEqual(run.status,0,"startup should refuse "+name);
  assert.match(run.stderr,/candidate_start_production_forbidden/,name);
 }
});
