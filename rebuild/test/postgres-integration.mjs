/**
 * Opt-in disposable PostgreSQL integration check. NEVER point at production.
 * Requires: npm install --no-save pg
 * Run only with HEALTHWISE_TEST_DATABASE_URL and HEALTHWISE_ISOLATED_DB_ACK=YES_DISPOSABLE_DB.
 * All objects are created inside a transaction and rolled back.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { createEventRepository } from "../src/integrations/postgres-events.mjs";

const url = process.env.HEALTHWISE_TEST_DATABASE_URL;
if (process.env.HEALTHWISE_ISOLATED_DB_ACK !== "YES_DISPOSABLE_DB" || !url) {
  throw new Error("disposable_database_explicit_ack_required");
}
const parsed = new URL(url);
if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error("postgres_url_required");
if (!/^(localhost|127\.0\.0\.1|::1)$/.test(parsed.hostname)) throw new Error("local_database_only");
const pool = new Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 3000 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const migration = await readFile(new URL("../db/001_foundation.sql", import.meta.url), "utf8");
  // Migration's BEGIN/COMMIT cannot be used inside a rollback-only test transaction.
  const ddl = migration.replace(/^BEGIN;\s*/m, "").replace(/\s*COMMIT;\s*$/m, "");
  const schema = "hw_test_" + process.pid;
  await client.query('CREATE SCHEMA "' + schema + '"');
  await client.query('SET LOCAL search_path TO "' + schema + '", public');
  await client.query(ddl);
  const account = "11111111-1111-4111-8111-111111111111";
  const order = "22222222-2222-4222-8222-222222222222";
  await client.query("INSERT INTO accounts(id,provider_subject) VALUES($1,$2)", [account, "user_1"]);
  await client.query("INSERT INTO consultation_orders(id,account_id,consultation_key,configured_price_id,currency,amount_minor,stripe_session_id) VALUES($1,$2,'quick','price_Abc123','usd',1500,'cs_test_abc')", [order,account]);
  // A pg-compatible adapter on the same connection avoids leaking test data.
  const testPool = { query:(...args)=>client.query(...args), connect:async()=>({query:(...args)=>client.query(...args),release(){}}) };
  const repository = createEventRepository(testPool);
  const snapshot = await repository.findOrderBySession("cs_test_abc");
  assert.equal(snapshot.configuredPriceId, "price_Abc123");
  assert.equal(snapshot.amountMinor, 1500);
  // Avoid nested transaction on same client; exercise SQL and constraints directly.
  await client.query("INSERT INTO provider_events(provider_event_id,event_type,outcome) VALUES('evt_abc','checkout.session.completed','received')");
  const duplicate = await client.query("INSERT INTO provider_events(provider_event_id,event_type,outcome) VALUES('evt_abc','checkout.session.completed','received') ON CONFLICT(provider_event_id) DO NOTHING RETURNING provider_event_id");
  assert.equal(duplicate.rowCount, 0);
  await assert.rejects(
    client.query("INSERT INTO consultation_orders(id,account_id,consultation_key,configured_price_id,currency,amount_minor,stripe_session_id) VALUES(gen_random_uuid(),$1,'quick','price_Abc123','usd',1500,'cs_test_abc')", [account]),
    /duplicate key/
  );
  // PostgreSQL aborts the transaction after a constraint violation. The
  // outer finally block rolls it back; do not continue querying this client.
  console.log("PASS: isolated migration, order snapshot, price binding, event deduplication");
} finally {
  await client.query("ROLLBACK").catch(()=>{});
  client.release();
  await pool.end();
}
