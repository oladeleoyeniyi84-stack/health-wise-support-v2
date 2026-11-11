import test from "node:test";
import assert from "node:assert/strict";
import { createEventRepository } from "../src/integrations/postgres-events.mjs";

test("failed payment decision rolls back event and entitlement transaction",async()=>{
 const statements=[];
 let released=0;
 const client={
  async query(sql){
   statements.push(sql);
   if(sql.startsWith("UPDATE consultation_orders"))throw Error("simulated_update_failure");
   return {rowCount:1,rows:[{account_id:"account1"}]};
  },
  release(){released++;}
 };
 const pool={connect:async()=>client,query:async()=>({rows:[]})};
 const repository=createEventRepository(pool);
 await assert.rejects(repository.transaction(async tx=>{
  assert.equal(await tx.recordEventOnce({eventId:"evt_rollback",type:"checkout.session.completed"}),true);
  await tx.applyDecision({action:"mark_paid",eventId:"evt_rollback",orderId:"order1"});
 }),/simulated_update_failure/);
 assert.equal(statements[0],"BEGIN");
 assert.equal(statements.at(-1),"ROLLBACK");
 assert.equal(statements.includes("COMMIT"),false);
 assert.equal(released,1);
});

test("failed transaction callback rolls back and releases connection",async()=>{
 const statements=[];
 let released=0;
 const client={query:async sql=>{statements.push(sql);return {rowCount:1};},release:()=>{released++;}};
 const repository=createEventRepository({connect:async()=>client,query:async()=>({rows:[]})});
 await assert.rejects(repository.transaction(async()=>{throw Error("simulated_callback_failure");}),/simulated_callback_failure/);
 assert.deepEqual(statements,["BEGIN","ROLLBACK"]);
 assert.equal(released,1);
});
