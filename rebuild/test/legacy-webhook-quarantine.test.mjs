import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../src/", import.meta.url));
async function files(dir){
  const result=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const path=join(dir,entry.name);
    if(entry.isDirectory())result.push(...await files(path));
    else if(entry.isFile()&&entry.name.endsWith(".mjs"))result.push(path);
  }
  return result;
}
test("legacy webhook implementation is quarantined from all application modules",async()=>{
  const offenders=[];
  for(const path of await files(src)){
    if(relative(src,path)==="integrations/stripe-webhook.mjs")continue;
    const source=await readFile(path,"utf8");
    // Check module imports/re-exports, not harmless documentation references.
    if(/(?:\bfrom\s*|\bimport\s*\(\s*)["'][^"']*stripe-webhook\.mjs["']/.test(source)){
      offenders.push(relative(src,path));
    }
  }
  assert.deepEqual(offenders,[],"legacy webhook must not be imported by application code");
});
