import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {Pool} from "pg";
import {assertDisposableDatabase} from "./support/disposable-db-guard.mjs";
import {createTrustedPostgresAdminSessionDependencies} from "../src/integrations/stripe-v2-postgres-admin-session-dependencies.mjs";
import {createTrustedReviewRevocationAuthorizer} from "../src/integrations/stripe-v2-trusted-review-admin.mjs";

const url=assertDisposableDatabase({
 url:process.env.HEALTHWISE_TEST_DATABASE_URL,
 ack:process.env.HEALTHWISE_ISOLATED_DB_ACK
});
const suffix=randomBytes(5).toString("hex");
const schema="hw_admin_auth_"+suffix,role="hw_admin_reader_"+suffix;
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const password=randomBytes(24).toString("hex");
const sessionId="verified_session_"+suffix,operatorId="admin_"+suffix;
const permission="healthwise.checkout.review_access.revoke";
const admin=new Pool({connectionString:url,max:2,connectionTimeoutMillis:3000});
let roleMade=false,schemaMade=false,reader;
try {
 await admin.query("CREATE ROLE "+quote(role)+" LOGIN PASSWORD '"+password+"'");roleMade=true;
 await admin.query("CREATE SCHEMA "+quote(schema));schemaMade=true;
 await admin.query("CREATE TABLE "+quote(schema)+".sandbox_review_sessions (session_id text PRIMARY KEY,operator_id text NOT NULL,revoked boolean NOT NULL,expires_at timestamptz NOT NULL)");
 await admin.query("CREATE TABLE "+quote(schema)+".sandbox_review_admin_grants (operator_id text NOT NULL,permission text NOT NULL,active boolean NOT NULL,PRIMARY KEY(operator_id,permission))");
 await admin.query("INSERT INTO "+quote(schema)+".sandbox_review_sessions VALUES($1,$2,false,now()+interval '1 hour')",[sessionId,operatorId]);
 await admin.query("INSERT INTO "+quote(schema)+".sandbox_review_admin_grants VALUES($1,$2,true)",[operatorId,permission]);
 await admin.query("GRANT USAGE ON SCHEMA "+quote(schema)+" TO "+quote(role));
 await admin.query("GRANT SELECT ON "+quote(schema)+".sandbox_review_sessions,"+quote(schema)+".sandbox_review_admin_grants TO "+quote(role));
 const readerUrl=new URL(url);readerUrl.username=role;readerUrl.password=password;
 reader=new Pool({connectionString:readerUrl.toString(),max:2,
  options:"-c search_path="+schema,connectionTimeoutMillis:3000});
 const ident=await reader.query("SELECT current_user,session_user,rolsuper FROM pg_roles WHERE rolname=current_user");
 assert.equal(ident.rows[0].current_user,role);
 assert.equal(ident.rows[0].session_user,role);
 assert.equal(ident.rows[0].rolsuper,false);
 let authenticatedSessionId=sessionId;
 const dependencies=createTrustedPostgresAdminSessionDependencies({
  pool:reader,
  // Test fixture for the separately verified server middleware contract.
  getAuthenticatedSessionId:async()=>authenticatedSessionId
 });
 const authorize=createTrustedReviewRevocationAuthorizer(dependencies);
 assert.equal(await authorize(),true);
 // Reader role cannot forge administrative authority.
 await assert.rejects(reader.query("UPDATE sandbox_review_admin_grants SET active=true"),e=>e.code==="42501");
 await assert.rejects(reader.query("UPDATE sandbox_review_sessions SET revoked=false"),e=>e.code==="42501");
 // Revoking an admin grant immediately denies subsequent authorization.
 await admin.query("UPDATE "+quote(schema)+".sandbox_review_admin_grants SET active=false WHERE operator_id=$1",[operatorId]);
 await assert.rejects(authorize(),/review_admin_forbidden/);
 await admin.query("UPDATE "+quote(schema)+".sandbox_review_admin_grants SET active=true WHERE operator_id=$1",[operatorId]);
 // Server-side session revocation also denies access.
 await admin.query("UPDATE "+quote(schema)+".sandbox_review_sessions SET revoked=true WHERE session_id=$1",[sessionId]);
 await assert.rejects(authorize(),/review_admin_forbidden/);
 await admin.query("UPDATE "+quote(schema)+".sandbox_review_sessions SET revoked=false,expires_at=now()-interval '1 minute' WHERE session_id=$1",[sessionId]);
 await assert.rejects(authorize(),/review_admin_forbidden/);
 // Client-controlled or malformed session hints never authorize.
 authenticatedSessionId="invalid' OR true--";
 await assert.rejects(authorize(),/review_admin_forbidden/);
 authenticatedSessionId="missing_session_"+suffix;
 await assert.rejects(authorize(),/review_admin_forbidden/);
 console.log("PASS: read-only administrative PostgreSQL identity and grant dependencies fail closed");
} finally {
 if(reader)await reader.end();
 if(schemaMade)await admin.query("DROP SCHEMA "+quote(schema)+" CASCADE").catch(()=>{});
 if(roleMade)await admin.query("DROP ROLE "+quote(role)).catch(()=>{});
 await admin.end();
}
