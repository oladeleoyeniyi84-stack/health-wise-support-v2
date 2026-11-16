import test from "node:test";
import assert from "node:assert/strict";
import {createPostgresSessionRecordReader} from "../src/integrations/postgres-session-reader.mjs";
test("parameterized lookup projects strict trusted row fields",async()=>{
 let params,sql;
 const reader=createPostgresSessionRecordReader({pool:{query:async(q,p)=>{
  sql=q;params=p;return {rowCount:1,rows:[{
   session_id:"isolated_session_0001",subject_id:"member_001",revoked:false,
   expires_at:new Date("2030-01-01T00:00:00Z")
  }]};
 }}});
 const session=await reader("isolated_session_0001");
 assert.equal(session.subjectId,"member_001");
 assert.equal(Object.isFrozen(session),true);
 assert.match(sql,/WHERE session_id=\$1/);
 assert.deepEqual(params,["isolated_session_0001"]);
});
test("malformed session IDs, ambiguous rows and outages fail closed",async()=>{
 let calls=0;
 const reader=createPostgresSessionRecordReader({pool:{query:async()=>{
  calls++;return {rowCount:2,rows:[{}]};
 }}});
 for(const id of ["bad","' OR true--",null,{}])assert.equal(await reader(id),null);
 assert.equal(calls,0);
 assert.equal(await reader("isolated_session_0001"),null);
 const down=createPostgresSessionRecordReader({pool:{query:async()=>{throw Error("outage");}}});
 assert.equal(await down("isolated_session_0001"),null);
 assert.throws(()=>createPostgresSessionRecordReader(),/trusted_session_reader_pool_required/);
});
