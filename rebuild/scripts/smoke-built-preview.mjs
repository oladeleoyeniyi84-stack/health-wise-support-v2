/** Smoke the assembled Engineering Vault artifact, not the source tree. */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createPreviewServer} from "../dist-preview/src/server.mjs";

const manifest=JSON.parse(await readFile(new URL("../dist-preview/package.json",import.meta.url),"utf8"));
assert.equal(manifest.private,true);
assert.equal(manifest.type,"module");
const server=createPreviewServer();
try{
  await new Promise((resolve,reject)=>{
    server.once("error",reject);
    server.listen(0,"127.0.0.1",resolve);
  });
  const address=server.address();
  assert.equal(address.address,"127.0.0.1");
  const origin=`http://127.0.0.1:${address.port}`;
  const probe=async(path,method="GET")=>fetch(origin+path,{
    method,redirect:"manual",signal:AbortSignal.timeout(3000)
  });
  const home=await probe("/");
  assert.equal(home.status,200);
  assert.match(home.headers.get("x-robots-tag")||"",/noindex/);
  assert.match(await home.text(),/Engineering Vault — Not released/);
  const health=await probe("/health");
  assert.equal(health.status,200);
  assert.equal((await health.json()).release,"blocked");
  const catalog=await probe("/api/consultations");
  assert.equal(catalog.status,503);
  assert.equal((await catalog.json()).error,"catalog_not_configured");
  for(const [path,method] of [
    ["/api/checkout","POST"],["/api/auth/session","GET"],
    ["/api/admin/review/revoke","POST"],["/book","GET"]
  ]){
    const response=await probe(path,method);
    assert.equal(response.status,503,`${method} ${path}`);
    assert.equal((await response.json()).error,"feature_not_released");
  }
  const absent=await probe("/consultations/quick");
  assert.equal(absent.status,404);
  console.log("PASS: packaged Healthwise preview serves only loopback-safe, unavailable routes");
}finally{
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}
