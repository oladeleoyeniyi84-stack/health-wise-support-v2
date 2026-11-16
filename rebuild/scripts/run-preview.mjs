/**
 * Healthwise Engineering Vault CLI — local loopback only, never a deployment entrypoint.
 * Refuse production mode and all non-loopback network bindings.
 * No external services, credentials, database or payments are connected.
 */
import {createPreviewServer} from "../src/server.mjs";

if(process.env.NODE_ENV==="production" ||
   process.env.RENDER!==undefined ||
   process.env.PORT ||
   process.env.HOST ||
   process.env.HEALTHWISE_PUBLIC_RELEASE!==undefined){
  console.error("engineering_preview_public_start_forbidden");
  process.exit(2);
}

const server=createPreviewServer();
server.on("error",error=>{
  console.error("engineering_preview_start_failed:",error.code||"unknown");
  process.exitCode=1;
});
server.listen(0,"127.0.0.1",()=>{
  const address=server.address();
  console.log(`Engineering Vault preview only: http://127.0.0.1:${address.port} (release blocked)`);
});
for(const signal of ["SIGTERM","SIGINT"]){
  process.once(signal,()=>server.close(()=>{process.exitCode=0;}));
}
