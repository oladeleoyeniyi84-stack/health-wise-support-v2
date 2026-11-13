import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertDisposableDatabase } from "./support/disposable-db-guard.mjs";

test("recovery exercises must be confined to the disposable PostgreSQL test target",()=>{
  const url="postgres://healthwise_test:fixture@127.0.0.1:5432/healthwise_disposable";
  assert.equal(assertDisposableDatabase({url,ack:"YES_DISPOSABLE_DB"}),url);
  for(const bad of [
    "postgres://healthwise_test:fixture@127.0.0.1:5432/postgres",
    "postgres://healthwise_test:fixture@127.0.0.1:5432/healthwise",
    "postgres://postgres:fixture@127.0.0.1:5432/healthwise_disposable",
    "postgres://healthwise_test:fixture@prod.internal:5432/healthwise_disposable"
  ]) assert.throws(()=>assertDisposableDatabase({url:bad,ack:"YES_DISPOSABLE_DB"}));
});
test("recovery evidence is not a production restore claim",async()=>{
 const migration=await readFile(new URL("../db/001_foundation.sql",import.meta.url),"utf8");
 assert.match(migration,/consultation_orders/);
 assert.match(migration,/provider_events/);
 assert.match(migration,/booking_entitlements/);
 const docs=await readFile(new URL("../docs/payment-release-gate-20261111.md",import.meta.url),"utf8");
 assert.match(docs,/backup|restore/i);
});
