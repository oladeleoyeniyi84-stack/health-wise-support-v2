import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {readFile} from "node:fs/promises";
import {Pool} from "pg";
import {assertDisposableDatabase} from "./support/disposable-db-guard.mjs";

const url=assertDisposableDatabase({url:process.env.HEALTHWISE_TEST_DATABASE_URL,ack:process.env.HEALTHWISE_ISOLATED_DB_ACK});
const admin=new Pool({connectionString:url,max:3});
const suffix=randomBytes(5).toString("hex");
const schema="hw_fn_"+suffix,owner="hw_fn_owner_"+suffix,writer="hw_fn_writer_"+suffix,revoker="hw_fn_revoker_"+suffix;
const q=s=>'"'+s.replaceAll('"','""')+'"';
const pw=randomBytes(24).toString("hex");
let schemaMade=false;
const roles=[];
const session="session_"+suffix,operator="reviewer_"+suffix;
let writerPool,revokerPool;
try {
 for(const [role,login] of [[owner,false],[writer,true],[revoker,true]]){
  await admin.query("CREATE ROLE "+q(role)+(login?" LOGIN PASSWORD '"+pw+"'":" NOLOGIN"));
  roles.push(role);
 }
 await admin.query("CREATE SCHEMA "+q(schema)+" AUTHORIZATION "+q(owner));schemaMade=true;
 await admin.query("CREATE TABLE "+q(schema)+".sandbox_review_sessions(session_id text PRIMARY KEY,operator_id text NOT NULL,revoked boolean NOT NULL,expires_at timestamptz NOT NULL)");
 await admin.query("CREATE TABLE "+q(schema)+".sandbox_review_grants(operator_id text NOT NULL,permission text NOT NULL,active boolean NOT NULL,UNIQUE(operator_id,permission))");
 await admin.query("ALTER TABLE "+q(schema)+".sandbox_review_sessions OWNER TO "+q(owner));
 await admin.query("ALTER TABLE "+q(schema)+".sandbox_review_grants OWNER TO "+q(owner));
 await admin.query("INSERT INTO "+q(schema)+".sandbox_review_sessions VALUES($1,$2,false,now()+interval '1 hour')",[session,operator]);
 await admin.query("INSERT INTO "+q(schema)+".sandbox_review_grants VALUES($1,$2,true)",[operator,"healthwise.checkout.review_evidence"]);
 await admin.query("GRANT USAGE ON SCHEMA "+q(schema)+" TO "+q(writer)+","+q(revoker));
 await admin.query("GRANT SELECT ON "+q(schema)+".sandbox_review_sessions,"+q(schema)+".sandbox_review_grants TO "+q(writer));
 const source=await readFile(new URL("../db/010_review_revocation_function_design.sql",import.meta.url),"utf8");
 assert.equal((source.match(/UPDATE REVIEWED_SCHEMA\./g)||[]).length,3,"expected both session-revocation branches and the grant-revocation UPDATE");
 const ddl=source.replaceAll("REVIEWED_SCHEMA",q(schema)).replace("CREATE OR REPLACE FUNCTION sandbox_revoke_review_access","CREATE OR REPLACE FUNCTION "+q(schema)+".sandbox_revoke_review_access");
 const signature=q(schema)+".sandbox_revoke_review_access(text,text)";
 const client=await admin.connect();
 try{
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE "+q(owner));
  await client.query(ddl);
  await client.query("REVOKE ALL ON FUNCTION "+signature+" FROM PUBLIC");
  await client.query("GRANT EXECUTE ON FUNCTION "+signature+" TO "+q(revoker));
  await client.query("RESET ROLE");
  await client.query("COMMIT");
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
 const acl=await admin.query(
  "SELECT p.prosecdef,p.proowner=(SELECT oid FROM pg_roles WHERE rolname=$2) AS owned,has_function_privilege($3,p.oid,'EXECUTE') AS writer_execute,has_function_privilege($4,p.oid,'EXECUTE') AS revoker_execute,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname='sandbox_revoke_review_access'",
  [schema,owner,writer,revoker]);
 assert.equal(acl.rowCount,1);
 assert.equal(acl.rows[0].prosecdef,true);
 assert.equal(acl.rows[0].owned,true);
 assert.equal(acl.rows[0].writer_execute,false);
 assert.equal(acl.rows[0].revoker_execute,true);
 assert.equal(acl.rows[0].public_execute,false);
 const loginPool=role=>{
  const u=new URL(url);u.username=role;u.password=pw;
  return new Pool({connectionString:u.toString(),max:1});
 };
 writerPool=loginPool(writer);revokerPool=loginPool(revoker);
 await assert.rejects(writerPool.query("SELECT "+signature+"($1,$2)",[operator,session]),e=>e.code==="42501");
 await assert.rejects(writerPool.query("UPDATE "+q(schema)+".sandbox_review_grants SET active=false"),e=>e.code==="42501");
 await assert.rejects(revokerPool.query("UPDATE "+q(schema)+".sandbox_review_grants SET active=false"),e=>e.code==="42501");
 await assert.rejects(revokerPool.query("SELECT "+signature+"($1,$2)",["x",session]),/invalid_revocation_request/);
 let state=await admin.query("SELECT active FROM "+q(schema)+".sandbox_review_grants");
 assert.equal(state.rows[0].active,true);
 const result=await revokerPool.query("SELECT "+signature+"($1,$2) AS revoked",[operator,session]);
 assert.equal(result.rows[0].revoked,true);
 state=await admin.query("SELECT active FROM "+q(schema)+".sandbox_review_grants");
 assert.equal(state.rows[0].active,false);
 const sessions=await admin.query("SELECT revoked FROM "+q(schema)+".sandbox_review_sessions");
 assert.equal(sessions.rows[0].revoked,true);
 console.log("PASS: disposable SECURITY DEFINER owner, ACL, revoker-only execution and fail-closed revocation");
} finally {
 if(writerPool)await writerPool.end();
 if(revokerPool)await revokerPool.end();
 if(schemaMade)await admin.query("DROP SCHEMA "+q(schema)+" CASCADE").catch(()=>{});
 for(const role of roles.reverse())await admin.query("DROP ROLE "+q(role)).catch(()=>{});
 await admin.end();
}
