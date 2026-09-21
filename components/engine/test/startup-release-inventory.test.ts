import {test} from "node:test";
import assert from "node:assert/strict";
import {startupReleaseInventory} from "../src/startup-release-inventory.ts";
const release=(tag_name:string)=>({tag_name,draft:false,prerelease:false,immutable:true});
test("startup inventory ranks stable releases numerically without granting update authority",async()=>{
 const result=await startupReleaseInventory("3.2.0",async()=>[
  release("3.9.0"),release("4.0.0"),release("3.10.0"),release("3.1.0"),release("3.11.0-preview"),
  {...release("3.12.0"),draft:true},{...release("3.13.0"),prerelease:true}]);
 assert.deepEqual(result.candidates.map(value=>value.tag_name),["3.10.0","3.9.0"]);
 assert.equal(result.major,"4.0.0");assert.equal(result.authority,"inventory-only");
});
test("startup inventory requires complete bounded pages and refuses malformed or duplicate entries",async()=>{
 const pages:number[]=[];
 const result=await startupReleaseInventory("3.0.0",async page=>{pages.push(page);return page===1?Array.from({length:100},(_,i)=>release(`3.1.${i}`)):[];});
 assert.deepEqual(pages,[1,2]);assert.equal(result.candidates.length,4);assert.equal(result.candidates[0]?.tag_name,"3.1.99");
 let calls=0;
 await assert.rejects(startupReleaseInventory("3.0.0",async()=>{calls++;return Array.from({length:100},()=>release("3.1.0"));}),/discovery bound/);
 assert.equal(calls,4);
 for(const value of [null,{},[null],Array(101).fill(release("3.1.0")),[release("3.1.0"),release("3.1.0")]])
  await assert.rejects(startupReleaseInventory("3.0.0",async()=>value));
 await assert.rejects(startupReleaseInventory("3.0.0",async()=>{throw new Error("transport failed");}),/transport failed/);
});
