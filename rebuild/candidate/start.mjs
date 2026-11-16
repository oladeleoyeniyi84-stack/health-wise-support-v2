/** Explicitly local Engineering Vault candidate startup. */
import {createCandidateBackend} from "./server.mjs";
if(process.env.NODE_ENV==="production" || process.env.RENDER!==undefined ||
 process.env.PORT!==undefined || process.env.HOST!==undefined ||
 process.env.HEALTHWISE_PUBLIC_RELEASE!==undefined)
 throw new Error("candidate_start_production_forbidden");
const server=createCandidateBackend();
server.listen(0,"127.0.0.1",()=>{
 const address=server.address();
 console.log("Engineering Vault candidate listening only on 127.0.0.1:"+address.port);
});
