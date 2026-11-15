import assert from "node:assert/strict";
import {Pool} from "pg";
import {assertDisposableDatabase} from "./support/disposable-db-guard.mjs";
// Isolated privilege-negative smoke test. This intentionally does not claim
// the current FOR UPDATE authorization adapter works as the restricted role.
const url=assertDisposableDatabase({url:process.env.HEALTHWISE_TEST_DATABASE_URL,ack:process.env.HEALTHWISE_ISOLATED_DB_ACK});
const pool=new Pool({connectionString:url,max:2,connectionTimeoutMillis:3000});
const schema="hw_privilege_"+process.pid;
const role="hw_evidence_reader_"+process.pid;
const ident=s=>'"'+s.replaceAll('"','""')+'"';
let schemaCreated=false,roleCreated=false;
const admin=await pool.connect();
try{
 await admin.query("CREATE ROLE "+ident(role)+" NOLOGIN");roleCreated=true;
 await admin.query("CREATE SCHEMA "+ident(schema));schemaCreated=true;
 await admin.query("CREATE TABLE "+ident(schema)+".sessions (id text PRIMARY KEY, revoked boolean NOT NULL)");
 await admin.query("CREATE TABLE "+ident(schema)+".grants (id text PRIMARY KEY, active boolean NOT NULL)");
 await admin.query("INSERT INTO "+ident(schema)+".sessions VALUES ('s',false)");
 await admin.query("INSERT INTO "+ident(schema)+".grants VALUES ('g',true)");
 await admin.query("GRANT USAGE ON SCHEMA "+ident(schema)+" TO "+ident(role));
 await admin.query("GRANT SELECT ON "+ident(schema)+".sessions,"+ident(schema)+".grants TO "+ident(role));
 await admin.query("SET ROLE "+ident(role));
 const session=await admin.query("SELECT revoked FROM "+ident(schema)+".sessions WHERE id='s'");
 assert.equal(session.rows[0].revoked,false);
 await assert.rejects(admin.query("UPDATE "+ident(schema)+".sessions SET revoked=true WHERE id='s'"),e=>e.code==="42501");
 await assert.rejects(admin.query("UPDATE "+ident(schema)+".grants SET active=false WHERE id='g'"),e=>e.code==="42501");
 await assert.rejects(admin.query("DELETE FROM "+ident(schema)+".sessions WHERE id='s'"),e=>e.code==="42501");
 await assert.rejects(admin.query("SELECT id FROM "+ident(schema)+".sessions FOR UPDATE"),e=>e.code==="42501");
 await assert.rejects(admin.query("INSERT INTO "+ident(schema)+".sessions VALUES ('forged',false)"),e=>e.code==="42501");
 await assert.rejects(admin.query("INSERT INTO "+ident(schema)+".grants VALUES ('forged',true)"),e=>e.code==="42501");
 await assert.rejects(admin.query("DELETE FROM "+ident(schema)+".grants WHERE id='g'"),e=>e.code==="42501");
 await assert.rejects(admin.query("TRUNCATE "+ident(schema)+".sessions"),e=>e.code==="42501");
 await assert.rejects(admin.query("CREATE TABLE "+ident(schema)+".forged (id text)"),e=>e.code==="42501");

 await admin.query("RESET ROLE");
 const check=await admin.query("SELECT revoked FROM "+ident(schema)+".sessions WHERE id='s'");
 assert.equal(check.rows[0].revoked,false);
 console.log("PASS: disposable SELECT-only reviewer role cannot INSERT, UPDATE, DELETE, TRUNCATE, CREATE, or SELECT FOR UPDATE");
}finally{
 await admin.query("RESET ROLE").catch(()=>{});
 if(schemaCreated)await admin.query("DROP SCHEMA "+ident(schema)+" CASCADE").catch(()=>{});
 if(roleCreated)await admin.query("DROP ROLE "+ident(role)).catch(()=>{});
 admin.release();
 await pool.end();
}
