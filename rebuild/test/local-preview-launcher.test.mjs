import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";

const script=new URL("../scripts/run-preview.mjs",import.meta.url);
const env={...process.env};
for(const key of ["NODE_ENV","RENDER","PORT","HOST","HEALTHWISE_PUBLIC_RELEASE"])delete env[key];

async function start(overrides={}){
 const child=spawn(process.execPath,[script.pathname],{
  env:{...env,...overrides},stdio:["ignore","pipe","pipe"]
 });
 let stdout="",stderr="";
 child.stdout.setEncoding("utf8");
 child.stderr.setEncoding("utf8");
 child.stdout.on("data",data=>{stdout+=data;});
 child.stderr.on("data",data=>{stderr+=data;});
 return {child,get stdout(){return stdout;},get stderr(){return stderr;}};
}

test("engineering preview denies production and external binding environments",async()=>{
 for(const overrides of [
  {NODE_ENV:"production"},{RENDER:"true"},{PORT:"10000"},
  {HOST:"0.0.0.0"},{HEALTHWISE_PUBLIC_RELEASE:"true"}
 ]){
  const run=await start(overrides);
  const [code]=await once(run.child,"exit");
  assert.equal(code,2,JSON.stringify(overrides));
  assert.match(run.stderr,/engineering_preview_public_start_forbidden/);
 }
});

test("engineering preview opens loopback only and blocks Checkout",async()=>{
 const run=await start();
 try{
  const url=await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(new Error("preview_start_timeout")),4000);
   run.child.once("error",error=>{clearTimeout(timeout);reject(error);});
   run.child.stdout.on("data",data=>{
    const match=data.match(/http:\/\/127\.0\.0\.1:\d+/);
    if(match){clearTimeout(timeout);resolve(match[0]);}
   });
  });
  const health=await fetch(url+"/health",{signal:AbortSignal.timeout(3000)});
  assert.equal(health.status,200);
  assert.equal((await health.json()).release,"blocked");
  const blocked=await fetch(url+"/api/checkout",{method:"POST",signal:AbortSignal.timeout(3000)});
  assert.equal(blocked.status,503);
  assert.equal((await blocked.json()).error,"feature_not_released");
 }finally{
  if(run.child.exitCode===null){
   run.child.kill("SIGTERM");
   await once(run.child,"exit");
  }
 }
});
