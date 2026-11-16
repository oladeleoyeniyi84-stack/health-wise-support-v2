import test from "node:test";
import assert from "node:assert/strict";
import {createPostgresOwnerReadProof} from "../src/integrations/postgres-owner-read-proof.mjs";

test("owner authorization must use trusted independent middleware and DB dependencies",()=>{
 assert.throws(()=>createPostgresOwnerReadProof(),/trusted_owner_db_dependencies_required/);
});

test("parameterized one-statement check binds authenticated session and record",async()=>{
 let observed;
 const mayRead=createPostgresOwnerReadProof({
  pool:{query:async(sql,params)=>{observed={sql,params};return {rowCount:1,rows:[{allowed:true}]};}},
  getAuthenticatedSessionId:async()=>"server_session_001"
 });
 assert.equal(await mayRead({recordId:"record_001"}),true);
 assert.deepEqual(observed.params,["record_001","server_session_001"]);
 assert.match(observed.sql,/s\.session_id=\$2/);
 assert.match(observed.sql,/r\.record_id=\$1/);
 assert.match(observed.sql,/s\.revoked=false/);
 assert.match(observed.sql,/CURRENT_TIMESTAMP/);
});

test("invalid identifiers and untrusted extras cannot reach database",async()=>{
 let queries=0;
 const mayRead=createPostgresOwnerReadProof({
  pool:{query:async()=>{queries++;return {rowCount:1,rows:[{allowed:true}]};}},
  getAuthenticatedSessionId:async()=>"server_session_001"
 });
 for(const recordId of [null,undefined,"","../admin","';DROP TABLE vault_sessions;--"]){
  assert.equal(await mayRead({recordId,role:"admin",serverVerified:true}),false);
 }
 assert.equal(queries,0);
});

test("untrusted session identifier or outage always fails closed",async()=>{
 for(const session of [undefined,"bad","x' OR 1=1 --"]){
  let queries=0;
  const mayRead=createPostgresOwnerReadProof({
   pool:{query:async()=>{queries++;return {rowCount:1,rows:[{allowed:true}]};}},
   getAuthenticatedSessionId:async()=>session
  });
  assert.equal(await mayRead({recordId:"record_001"}),false);
  assert.equal(queries,0);
 }
 const broken=createPostgresOwnerReadProof({
  pool:{query:async()=>{throw Error("db_down");}},
  getAuthenticatedSessionId:async()=>"server_session_001"
 });
 assert.equal(await broken({recordId:"record_001"}),false);
});
