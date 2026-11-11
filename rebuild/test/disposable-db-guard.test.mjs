import { test } from "node:test";
import assert from "node:assert/strict";
import { assertDisposableDatabase } from "./support/disposable-db-guard.mjs";
const good="postgres://healthwise_test:disposable_ci_only@127.0.0.1:5432/healthwise_disposable";
test("explicit acknowledgment and exact disposable DB are required",()=>{
  assert.equal(assertDisposableDatabase({url:good,ack:"YES_DISPOSABLE_DB"}),good);
  for(const ack of [undefined,"", "YES","yes_disposable_db"]){
    assert.throws(()=>assertDisposableDatabase({url:good,ack}),/disposable_database_explicit_ack_required/);
  }
});
test("reject production, external, and deceptive database targets",()=>{
  for(const url of [
    "postgres://healthwise_test:pass@db.production.example/healthwise_disposable",
    "postgres://healthwise_test:pass@localhost.evil.example/healthwise_disposable",
    "postgres://healthwise_test:pass@localhost/healthwise_production",
    "postgres://admin:pass@localhost/healthwise_disposable",
    "postgres://healthwise_test:pass@localhost/healthwise_disposable?sslmode=require",
    "postgres://healthwise_test:pass@localhost/healthwise_disposable#fragment",
    "https://localhost/healthwise_disposable",
    "not a URL"
  ]){
    assert.throws(()=>assertDisposableDatabase({url,ack:"YES_DISPOSABLE_DB"}),url);
  }
});
