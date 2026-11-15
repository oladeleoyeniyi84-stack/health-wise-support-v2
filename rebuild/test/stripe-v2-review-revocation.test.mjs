import test from "node:test";
import assert from "node:assert/strict";
import {revokeSandboxReviewerAccess as revoke} from "../src/integrations/stripe-v2-review-revocation.mjs";
const request={operatorId:"review_staff",sessionId:"trusted_session_0001"};
test("revocation rejects missing server-owned admin authorization before DB access",async()=>{
 let connects=0;
 const pool={connect:async()=>{connects++;throw Error("unexpected");}};
 await assert.rejects(revoke({...request,pool,authorizeAdministrator:async()=>false}),/review_admin_forbidden/);
 assert.equal(connects,0);
});
test("invalid reviewer or permission cannot invoke administrator or database",async()=>{
 let calls=0;
 const pool={connect:async()=>{calls++;}};
 const authorizeAdministrator=async()=>{calls++;return true;};
 await assert.rejects(revoke({...request,pool,authorizeAdministrator,permission:"stripe.admin"}),/invalid_revocation_request/);
 assert.equal(calls,0);
});
test("trusted revocation updates session and grant in a single transaction",async()=>{
 const sql=[];
 const client={query:async(statement,values)=>{
  sql.push({statement,values});
  if(statement.startsWith("UPDATE"))return {rowCount:1,rows:[{}]};
  return {rowCount:0,rows:[]};
 },release:()=>{}};
 const result=await revoke({...request,pool:{connect:async()=>client},authorizeAdministrator:async()=>true});
 assert.equal(result.action,"review_access_revoked");
 assert.equal(result.retryAllowed,false);
 assert.deepEqual(sql.map(x=>x.statement.split(" ")[0]),["BEGIN","UPDATE","UPDATE","COMMIT"]);
 assert.match(sql[1].statement,/SET revoked=true/);
 assert.match(sql[2].statement,/SET active=false/);
 assert.ok(sql.every(x=>!x.statement.includes("DELETE")));
});
test("missing target rolls back without claiming revocation",async()=>{
 const sql=[];
 const client={query:async statement=>{
  sql.push(statement);
  if(statement.startsWith("UPDATE"))return {rowCount:0,rows:[]};
  return {rowCount:0,rows:[]};
 },release:()=>{}};
 await assert.rejects(revoke({...request,pool:{connect:async()=>client},authorizeAdministrator:async()=>true}),/review_revocation_target_missing/);
 assert.equal(sql.at(-1),"ROLLBACK");
});
