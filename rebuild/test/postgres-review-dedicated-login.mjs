import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {Pool} from "pg";
import {assertDisposableDatabase} from "./support/disposable-db-guard.mjs";
import {createPostgresLockedReviewAuthorization} from "../src/integrations/stripe-v2-postgres-review-authorization.mjs";

const url=assertDisposableDatabase({url:process.env.HEALTHWISE_TEST_DATABASE_URL,ack:process.env.HEALTHWISE_ISOLATED_DB_ACK});
const admin=new Pool({connectionString:url,max:2});
const schema="hw_login_"+process.pid,role="hw_writer_"+process.pid;
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const password=randomBytes(24).toString("hex");
const sessionId="login_session_01",operatorId="login_reviewer";
let createdRole=false,createdSchema=false,writer;
try{
 await admin.query("CREATE ROLE "+quote(role)+" LOGIN PASSWORD $1",[password]).catch(async e=>{
  // PostgreSQL DDL does not accept parameter placeholders for role passwords.
  if(e.code!=="42601")throw e;
  await admin.query("CREATE ROLE "+quote(role)+" LOGIN PASSWORD '"+password+"'");
 });
 createdRole=true;
 await admin.query("CREATE SCHEMA "+quote(schema));createdSchema=true;
 await admin.query("CREATE TABLE "+quote(schema)+".sandbox_review_sessions(session_id text PRIMARY KEY,operator_id text NOT NULL,revoked boolean NOT NULL,expires_at timestamptz NOT NULL)");
 await admin.query("CREATE TABLE "+quote(schema)+".sandbox_review_grants(operator_id text NOT NULL,permission text NOT NULL,active boolean NOT NULL)");
 await admin.query("INSERT INTO "+quote(schema)+".sandbox_review_sessions VALUES($1,$2,false,now()+interval '1 hour')",[sessionId,operatorId]);
 await admin.query("INSERT INTO "+quote(schema)+".sandbox_review_grants VALUES($1,$2,true)",[operatorId,"healthwise.checkout.review_evidence"]);
 await admin.query("GRANT USAGE ON SCHEMA "+quote(schema)+" TO "+quote(role));
 await admin.query("GRANT SELECT ON "+quote(schema)+".sandbox_review_sessions,"+quote(schema)+".sandbox_review_grants TO "+quote(role));
 const writerUrl=new URL(url);writerUrl.username=role;writerUrl.password=password;
 writer=new Pool({connectionString:writerUrl.toString(),max:2,options:"-c search_path="+schema});
 const identity=await writer.query("SELECT current_user,session_user,rolsuper,rolcreaterole FROM pg_roles WHERE rolname=current_user");
 assert.equal(identity.rows[0].current_user,role);
 assert.equal(identity.rows[0].session_user,role);
 assert.equal(identity.rows[0].rolsuper,false);
 assert.equal(identity.rows[0].rolcreaterole,false);
 const withAuth=createPostgresLockedReviewAuthorization({
  pool:writer,useRowLocks:false,loadVerifiedServerSession:async()=>({verifiedByServer:true,sessionId,operatorId})
 });
 assert.equal(await withAuth(async({operator})=>operator.id),operatorId);
 const denied=[
  "UPDATE sandbox_review_sessions SET revoked=true",
  "UPDATE sandbox_review_grants SET active=false",
  "DELETE FROM sandbox_review_sessions",
  "INSERT INTO sandbox_review_grants VALUES ('forged','healthwise.checkout.review_evidence',true)",
  "TRUNCATE sandbox_review_sessions",
  "CREATE TABLE "+quote(schema)+".forged(id text)",
  "SELECT session_id FROM sandbox_review_sessions FOR UPDATE",
  "SET ROLE healthwise_test"
 ];
 for(const sql of denied){
  await assert.rejects(writer.query(sql),e=>["42501","0P000"].includes(e.code),sql);
 }
 const result=await admin.query("SELECT revoked FROM "+quote(schema)+".sandbox_review_sessions");
 assert.equal(result.rows[0].revoked,false);
 console.log("PASS: dedicated non-superuser LOGIN runs actual adapter; mutation and escalation denied");
}finally{
 if(writer)await writer.end();
 if(createdSchema)await admin.query("DROP SCHEMA "+quote(schema)+" CASCADE").catch(()=>{});
 if(createdRole)await admin.query("DROP ROLE "+quote(role)).catch(()=>{});
 await admin.end();
}
