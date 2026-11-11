import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createIsolatedSandboxWebhookServer } from "../src/isolated-sandbox-webhook.mjs";

async function withServer(options,fn){
 const server=createIsolatedSandboxWebhookServer(options);
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{return await fn("http://127.0.0.1:"+server.address().port+"/sandbox/webhook");}
 finally{await new Promise(resolve=>server.close(resolve));}
}
const order={id:"order1",userId:"user1",stripeSessionId:"cs_test_123",status:"pending",amountMinor:1500,currency:"usd",consultationKey:"quick",configuredPriceId:"price_123"};
const event={id:"evt_123",livemode:false,type:"checkout.session.completed",data:{object:{id:"cs_test_123",livemode:false,mode:"payment",payment_status:"paid",client_reference_id:"user1",amount_total:1500,currency:"usd",metadata:{orderId:"order1",consultationKey:"quick"}}}};
function harness({outage=false,invalidSignature=false}={}){
 let verified=0,lookups=0,transactions=0,applied=0,seen=false;
 const stripe={webhooks:{constructEvent:(body,sig)=>{verified++;assert.equal(body.toString(),"signed-raw");if(invalidSignature||sig!=="valid")throw Error("invalid");return event;}},checkout:{sessions:{listLineItems:async()=>{lookups++;if(outage)throw Error("unavailable");return {has_more:false,data:[{quantity:1,amount_total:1500,price:{id:"price_123",active:true,currency:"usd"}}]};}}}};
 const repository={findOrderBySession:async()=>order,transaction:async fn=>{transactions++;return fn({lockOrderBySession:async()=>order,recordEventOnce:async()=>{if(seen)return false;seen=true;return true;},applyDecision:async d=>{if(d.action==="mark_paid")applied++;}});}};
 return {stripe,repository,endpointSecret:"whsec_test",stats:()=>({verified,lookups,transactions,applied})};
}
const post=(url,body="signed-raw",headers={})=>fetch(url,{method:"POST",headers:{"stripe-signature":"valid",...headers},body});
test("isolated route preserves raw bytes and idempotent redelivery",async()=>{
 const h=harness();
 await withServer(h,async url=>{
  const a=await post(url);assert.equal(a.status,200);assert.equal((await a.json()).action,"mark_paid");
  const b=await post(url);assert.equal(b.status,200);assert.equal((await b.json()).action,"duplicate");
 });
 assert.deepEqual(h.stats(),{verified:2,lookups:2,transactions:2,applied:1});
});
test("invalid signature fails before repository and provider lookup",async()=>{
 const h=harness({invalidSignature:true});
 await withServer(h,async url=>{const r=await post(url);assert.equal(r.status,400);});
 assert.deepEqual(h.stats(),{verified:1,lookups:0,transactions:0,applied:0});
});
test("provider outage returns non-2xx without consuming event",async()=>{
 const h=harness({outage:true});
 await withServer(h,async url=>{const r=await post(url);assert.equal(r.status,503);assert.equal((await r.json()).error,"retryable_provider_failure");});
 assert.deepEqual(h.stats(),{verified:1,lookups:1,transactions:0,applied:0});
});
test("missing signature, wrong method, oversized declared body and unknown route fail closed",async()=>{
 const h=harness();
 await withServer(h,async url=>{
  assert.equal((await fetch(url,{method:"GET"})).status,405);
  assert.equal((await fetch(url,{method:"POST",body:"signed-raw"})).status,400);
  assert.equal((await fetch(url,{method:"POST",headers:{"stripe-signature":"valid"},body:"x".repeat(262145)})).status,413);
  assert.equal((await fetch(url.replace("/sandbox/webhook","/api/checkout"))).status,404);
 });
 assert.deepEqual(h.stats(),{verified:0,lookups:0,transactions:0,applied:0});
});
test("preview server does not import isolated webhook harness",async()=>{
 const source=await readFile(new URL("../src/server.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(source,/isolated-sandbox-webhook/);
});

test("all isolated webhook responses suppress caching and browser embedding",async()=>{
 const h=harness({invalidSignature:true});
 await withServer(h,async url=>{
  for(const response of [await post(url),await fetch(url,{method:"GET"})]){
   assert.equal(response.headers.get("cache-control"),"no-store");
   assert.equal(response.headers.get("x-content-type-options"),"nosniff");
   assert.equal(response.headers.get("referrer-policy"),"no-referrer");
   assert.match(response.headers.get("content-security-policy")||"",/frame-ancestors 'none'/);
  }
 });
});

test("incomplete HTTP body never invokes payment reconciliation",async()=>{
 const h=harness();
 await withServer(h,async url=>{
  const {request}=await import("node:http");
  const target=new URL(url);
  await new Promise((resolve,reject)=>{
   const req=request({hostname:target.hostname,port:target.port,path:target.pathname,method:"POST",headers:{"stripe-signature":"valid","content-length":"20"}});
   req.on("error",err=>{if(err.code==="ECONNRESET"||err.code==="EPIPE")resolve();else reject(err);});
   req.on("response",res=>{res.resume();res.on("end",resolve);});
   req.flushHeaders();
   req.write("partial");
   req.destroy();
   resolve();
  });
  await new Promise(resolve=>setTimeout(resolve,30));
 });
 assert.deepEqual(h.stats(),{verified:0,lookups:0,transactions:0,applied:0});
});

test("oversized streamed chunked body fails before signature verification and reconciliation",async()=>{
 const h=harness();
 await withServer(h,async url=>{
  const response=await fetch(url,{method:"POST",headers:{"stripe-signature":"valid"},body:new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode("x".repeat(262145)));controller.close();}}),duplex:"half"});
  assert.equal(response.status,413);
  assert.equal((await response.json()).error,"payload_too_large");
 });
 assert.deepEqual(h.stats(),{verified:0,lookups:0,transactions:0,applied:0});
});
