/**
 * Healthwise candidate backend shell, Engineering Vault only.
 * No auth, DB, payment, booking, or provider imports. Not production capable.
 */
import {createServer} from "node:http";
const blocked=Object.freeze({error:"engineering_vault_unreleased",release:"blocked"});
export function createCandidateBackend(){
 return createServer((req,res)=>{
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Robots-Tag","noindex, nofollow, noarchive");
  res.setHeader("Content-Security-Policy","default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  const path=new URL(req.url||"/","http://127.0.0.1").pathname;
  if(req.method==="GET" && path==="/health"){
   res.writeHead(200);
   return res.end(JSON.stringify({ok:true,component:"candidate-backend",release:"blocked"}));
  }
  // No implicit static files, auth, bookings or writes, even on GET.
  res.writeHead(503);
  res.end(JSON.stringify(blocked));
 });
}
