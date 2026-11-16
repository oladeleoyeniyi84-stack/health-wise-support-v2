import test from "node:test";
import assert from "node:assert/strict";
import {createPreviewServer} from "../src/server.mjs";
import {renderEngineeringPreview} from "../src/preview-page.mjs";

const privateCatalog=[{
 key:"quick",title:'<script>alert("x")</script> & Consultation',
 durationMinutes:15,stripePriceId:"price_Private123",
 calendlyEventUrl:"https://calendly.com/weareelevate360/private-booking"
}];

async function request(path,method="GET"){
 const server=createPreviewServer({catalog:privateCatalog});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
  const {port}=server.address();
  return await fetch(`http://127.0.0.1:${port}${path}`,{method});
 }finally{await new Promise(resolve=>server.close(resolve));}
}

test("local preview renders accessible unavailable-state page with no secrets",async()=>{
 const response=await request("/");
 const html=await response.text();
 assert.equal(response.status,200);
 assert.match(response.headers.get("content-type"),/^text\/html/);
 assert.equal(response.headers.get("cache-control"),"no-store");
 assert.match(response.headers.get("x-robots-tag"),/noindex/);
 assert.match(response.headers.get("content-security-policy"),/form-action 'none'/);
 assert.match(html,/<main\b/);
 assert.match(html,/<h1>Healthwise Support<\/h1>/);
 assert.match(html,/Engineering Vault — Not released/);
 assert.match(html,/Currently unavailable/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
 assert.doesNotMatch(html,/price_Private123|calendly\.com|private-booking/);
 assert.doesNotMatch(html,/<form\b|<button\b|<iframe\b/i);
});
test("no catalog produces a non-offering placeholder",()=>{
 const html=renderEngineeringPreview([]);
 assert.match(html,/No verified consultation offerings are published/);
 assert.doesNotMatch(html,/<form\b|<script\b|<iframe\b/i);
});
test("same-origin styles are static; restricted routes remain disabled",async()=>{
 const css=await request("/preview.css");
 assert.equal(css.status,200);
 assert.match(css.headers.get("content-type"),/^text\/css/);
 assert.match(await css.text(),/color-scheme:dark/);
 for(const path of ["/api/checkout","/api/admin/review/revoke","/api/auth/session"]){
  const response=await request(path,"POST");
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,"feature_not_released");
 }
});

test("read-only consultation details escape content and never reveal provider IDs",async()=>{
 const landing=await request("/");
 const landingHtml=await landing.text();
 assert.match(landingHtml,/href="\/consultations\/quick"/);
 const response=await request("/consultations/quick");
 const html=await response.text();
 assert.equal(response.status,200);
 assert.match(response.headers.get("x-robots-tag"),/noindex/);
 assert.match(response.headers.get("content-security-policy"),/form-action 'none'/);
 assert.match(html,/Engineering Vault/);
 assert.match(html,/&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script\b|<form\b|<button\b|<iframe\b/i);
 assert.doesNotMatch(html,/price_Private123|calendly\.com|private-booking/);
});
test("unknown consultation IDs, unconfigured catalog, and write methods remain denied",async()=>{
 for(const path of ["/consultations/invalid","/consultations/%2Fapi%2Fcheckout"]){
  const response=await request(path);
  assert.equal(response.status,404);
 }
 const attemptedPost=await request("/consultations/quick","POST");
 assert.equal(attemptedPost.status,404);
 const server=createPreviewServer();
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
  const response=await fetch(`http://127.0.0.1:${server.address().port}/consultations/quick`);
  assert.equal(response.status,404);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
