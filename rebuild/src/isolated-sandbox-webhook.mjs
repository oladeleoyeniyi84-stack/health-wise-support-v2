import { createServer } from "node:http";
import { processSignedSandboxReconciliation } from "./integrations/signed-reconciliation.mjs";

const MAX_BODY_BYTES=262144;
const BODY_TIMEOUT_MS=5000;
const reply=(res,status,payload)=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'","Referrer-Policy":"no-referrer"});res.end(JSON.stringify(payload));};

/**
 * Engineering-only isolated webhook harness. Never imported or mounted by
 * preview server. Requires injected test-mode Stripe SDK and repository.
 * Bind to loopback only in disposable tests; no secrets or network providers
 * are instantiated by this module.
 */
export function createIsolatedSandboxWebhookServer({stripe,repository,endpointSecret}={}){
 return createServer(async(req,res)=>{
  const path=new URL(req.url||"/","http://localhost").pathname;
  if(path!=="/sandbox/webhook")return reply(res,404,{error:"not_found"});
  if(req.method!=="POST"){res.setHeader("Allow","POST");return reply(res,405,{error:"method_not_allowed"});}
  const signature=req.headers["stripe-signature"];
  if(typeof signature!=="string"||!signature)return reply(res,400,{error:"signature_required"});
  const declared=Number(req.headers["content-length"]);
  if(req.headers["content-length"]!==undefined&&(!Number.isSafeInteger(declared)||declared<0||declared>MAX_BODY_BYTES))return reply(res,413,{error:"payload_too_large"});
  let chunks=[],size=0;
  let timer;
  try{
   const body=await Promise.race([
    (async()=>{
     for await(const chunk of req){
    size+=chunk.length;
    if(size>MAX_BODY_BYTES)throw new Error("payload_too_large");
     chunks.push(chunk);
     }
     if(!req.complete)throw new Error("incomplete_request");
     return Buffer.concat(chunks);
    })(),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("body_timeout")),BODY_TIMEOUT_MS);})
   ]);
   clearTimeout(timer);
   const result=await processSignedSandboxReconciliation({rawBody:body,signature,endpointSecret,stripe,repository});
   return reply(res,200,{action:result.action});
  }catch(err){
   if(res.destroyed||res.writableEnded)return;
   if(err?.message==="payload_too_large")return reply(res,413,{error:"payload_too_large"});
   if(err?.message==="body_timeout")return reply(res,408,{error:"request_timeout"});
   if(err?.message==="incomplete_request"||err?.code==="ECONNRESET")return reply(res,400,{error:"incomplete_request"});
   const code=err?.message;
   if(code==="invalid_raw_body")return reply(res,400,{error:"invalid_raw_body"});
   if(code==="invalid_webhook_signature"||code==="sandbox_event_required"||code==="sandbox_session_required")return reply(res,400,{error:"invalid_event"});
   if(code==="webhook_configuration_required"||code==="stripe_verifier_required"||code==="repository_required"||code==="stripe_lookup_required"||code==="transaction_contract_required"||code==="deduplication_unavailable")return reply(res,503,{error:"service_unavailable"});
   if(code==="stripe_lookup_retryable"||code==="stripe_response_retryable")return reply(res,503,{error:"retryable_provider_failure"});
   return reply(res,503,{error:"reconciliation_unavailable"});
  }finally{clearTimeout(timer);}
 });
}
