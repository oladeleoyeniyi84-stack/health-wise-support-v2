/**
 * Engineering Vault — dependency-free loopback startup smoke test.
 * Starts the actual preview server on an ephemeral localhost port only.
 * No provider, payment, database, hosting or production connections.
 */
import assert from "node:assert/strict";
import {createPreviewServer} from "../src/server.mjs";

const server=createPreviewServer();
try {
  await new Promise((resolve,reject)=>{
    server.once("error",reject);
    server.listen(0,"127.0.0.1",resolve);
  });
  const address=server.address();
  assert.ok(address && typeof address==="object");
  const origin=`http://127.0.0.1:${address.port}`;
  async function check(path,method,expectedStatus,expectedError){
    const response=await fetch(origin+path,{method,redirect:"manual",
      signal:AbortSignal.timeout(3000)});
    assert.equal(response.status,expectedStatus,`${method} ${path}`);
    assert.equal(response.headers.get("cache-control"),"no-store");
    const body=await response.json();
    assert.equal(body.release??"blocked","blocked");
    if(expectedError)assert.equal(body.error,expectedError);
  }
  await check("/health","GET",200);
  await check("/api/consultations","GET",503,"catalog_not_configured");
  await check("/api/checkout","POST",503,"feature_not_released");
  await check("/api/admin/review/revoke","POST",503,"feature_not_released");
  await check("/api/auth/session","GET",503,"feature_not_released");
  console.log("PASS: Healthwise Engineering Vault preview starts on loopback and blocks restricted routes");
}finally{
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}
