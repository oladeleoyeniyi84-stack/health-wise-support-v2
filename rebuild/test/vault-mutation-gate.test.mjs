import test from "node:test";
import assert from "node:assert/strict";
import {createVaultMutationGate} from "../src/integrations/vault-mutation-gate.mjs";

const token="v1.session_abcdefgh."+("A".repeat(43));
function request(overrides={}){
 const headers={
  cookie:"__Host-healthwise_vault="+token,
  origin:"https://healthwisesupport.test",
  "x-csrf-token":"B".repeat(43)
 };
 return {method:"POST",headers,rawHeaders:[
  "Cookie",headers.cookie,"Origin",headers.origin,
  "X-CSRF-Token",headers["x-csrf-token"]
 ],...overrides};
}
function build(counts,options={}){
 return createVaultMutationGate({
  expectedOrigin:"https://healthwisesupport.test",
  assertTrustedTransport:async()=>{counts.transport++;return options.transport??true;},
  authenticateRequest:async()=>{counts.auth++;return Object.hasOwn(options,"context")?options.context:Object.freeze({scope:"test"});},
  authorizeMutation:async()=>{counts.csrf++;return options.csrf??true;},
  authorizeOperation:async()=>{counts.policy++;return options.policy??true;}
 });
}
const counts=()=>({transport:0,auth:0,csrf:0,policy:0});

test("mutating requests require transport, auth, CSRF, then independent write authorization",async()=>{
 const c=counts(),guard=build(c);
 assert.equal(await guard(request()),true);
 assert.deepEqual(c,{transport:1,auth:1,csrf:1,policy:1});
});

test("missing or ambiguous headers reject before authentication",async()=>{
 const c=counts(),guard=build(c);
 const base=request();
 const invalid=[
  {...base,method:"GET"},
  {...base,headers:{...base.headers,origin:"https://evil.example"}},
  {...base,headers:{...base.headers,"x-csrf-token":undefined}},
  {...base,headers:{...base.headers,cookie:""}},
  {...base,rawHeaders:[...base.rawHeaders,"Origin",base.headers.origin]},
  {...base,rawHeaders:[...base.rawHeaders,"Cookie",base.headers.cookie]},
  {...base,rawHeaders:[...base.rawHeaders,"X-CSRF-Token",base.headers["x-csrf-token"]]},
  {...base,rawHeaders:undefined}
 ];
 for(const req of invalid)assert.equal(await guard(req),false);
 assert.equal(c.auth,0);
 assert.equal(c.policy,0);
});

test("fail-closed checks prevent write policy from executing",async()=>{
 for(const opt of [{transport:false},{context:null},{csrf:false},{policy:false}]){
  const c=counts(),guard=build(c,opt);
  assert.equal(await guard(request()),false);
  if(opt.transport===false)assert.equal(c.auth,0);
  if(opt.context===null)assert.equal(c.csrf,0);
  if(opt.csrf===false)assert.equal(c.policy,0);
 }
});

test("errors and missing independently trusted providers deny",async()=>{
 assert.throws(()=>createVaultMutationGate(),/vault_mutation_gate_dependencies_required/);
 const c=counts();
 const guard=createVaultMutationGate({
  expectedOrigin:"https://healthwisesupport.test",
  assertTrustedTransport:async()=>true,
  authenticateRequest:async()=>Object.freeze({scope:"test"}),
  authorizeMutation:async()=>true,
  authorizeOperation:async()=>{c.policy++;throw Error("grant store down");}
 });
 assert.equal(await guard(request()),false);
 assert.equal(c.policy,1);
});
