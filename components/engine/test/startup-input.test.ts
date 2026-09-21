import {test} from "node:test";
import assert from "node:assert/strict";
import {PassThrough,Readable} from "node:stream";
import {startupInput} from "../src/startup-input.ts";

test("native startup input accepts chunked UTF-8 JSON and removes listeners",async()=>{
 const bytes=Buffer.from(JSON.stringify({session_id:"aé",hook_event_name:"SessionStart"}));
 const input=Readable.from([...bytes].map(byte=>Buffer.from([byte])));
 assert.deepEqual(await startupInput(input),{session_id:"aé",hook_event_name:"SessionStart"});
 assert.equal(input.listenerCount("data"),0);
});
test("native startup input refuses malformed, oversized and interrupted events",async()=>{
 for(const bytes of [Buffer.from("{"),Buffer.from([0xff]),Buffer.alloc(65537,32)])
  await assert.rejects(startupInput(Readable.from([bytes])),/Malformed|exceeds/);
 const input=new PassThrough();const result=startupInput(input);input.destroy();
 await assert.rejects(result,/closed before/);
});
test("native startup input times out without retaining listeners",async()=>{
 const input=new PassThrough();
 await assert.rejects(startupInput(input,15),/deadline/);
 assert.equal(input.listenerCount("data"),0);assert.equal(input.listenerCount("end"),0);
 input.destroy();
});
