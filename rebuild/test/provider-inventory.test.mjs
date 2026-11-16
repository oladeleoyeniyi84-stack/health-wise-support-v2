import test from "node:test";
import assert from "node:assert/strict";
import {
 validateProviderInventoryRecord,inspectProviderInventory
} from "../src/domain/provider-inventory.mjs";
const fixture=()=>({
 provider:"stripe",resourceKind:"payment-test-account",
 resourceId:"acct_1T36fzDSAM5aSpF4",environment:"test",
 ownerEvidence:"connected-account-listed",
 historicalData:"unknown",backupEvidence:"unknown"
});

test("known non-sensitive resource metadata is inventory only, never release approval",()=>{
 const record=validateProviderInventoryRecord(fixture());
 assert.equal(Object.isFrozen(record),true);
 assert.equal(record.safeToMigrate,false);
 assert.equal(record.safeToPublish,false);
 assert.equal(record.productionOwnershipVerified,false);
 assert.equal(record.recoveryVerified,false);
 assert.equal(record.ownerEvidence,"connected-account-listed");
 assert.notEqual(record.ownerEvidence,"owner-dashboard-reviewed");
 const report=inspectProviderInventory([fixture()]);
 assert.equal(report.decision,"NO_GO");
 assert.equal(report.historicalSourceOfTruthVerified,false);
 assert.equal(report.releaseAuthorized,false);
 assert.equal(Object.isFrozen(report.records),true);
});

test("untrusted flags and arbitrary fields cannot fabricate production ownership",()=>{
 const added={...fixture(),productionOwnershipVerified:true};
 assert.throws(()=>validateProviderInventoryRecord(added),/inventory_record_fields_not_allowed/);
 assert.throws(()=>validateProviderInventoryRecord({...fixture(),customerEmail:"someone@example.com"}),/inventory_record_fields_not_allowed/);
 assert.throws(()=>validateProviderInventoryRecord({...fixture(),connectionString:"postgres://secret"}),/inventory_record_fields_not_allowed/);
 assert.throws(()=>validateProviderInventoryRecord({...fixture(),ownerEvidence:"verified"}),/inventory_record_value_invalid/);
});

test("secret-like identifiers and malformed fields are rejected",()=>{
 for(const id of ["sk_test_abc123","sk_live_abc123","password_123",
  "token_123","postgres://user:pass@host/db","a@example.com",
  "https://provider.example.com/app","",{}]){
  assert.throws(()=>validateProviderInventoryRecord({...fixture(),resourceId:id}),
    /inventory_record_/);
 }
 for(const bad of [null,[],{},{"provider":"stripe"},{...fixture(),environment:"live"},
  {...fixture(),historicalData:"zero"},{...fixture(),backupEvidence:"restored"}])
  assert.throws(()=>validateProviderInventoryRecord(bad),/inventory_record_/);
});

test("duplicate records and oversized collections are denied",()=>{
 assert.throws(()=>inspectProviderInventory([fixture(),fixture()]),/inventory_duplicate_resource/);
 assert.throws(()=>inspectProviderInventory(Array(51).fill(fixture())),/inventory_list_invalid/);
 assert.throws(()=>inspectProviderInventory({records:[fixture()]}),/inventory_list_invalid/);
 assert.equal(inspectProviderInventory([]).releaseAuthorized,false);
});
