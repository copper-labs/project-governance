import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { contextRouteCommand } from "../src/context-route-command.ts";
import { promptContext } from "../src/prompt-context.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { contextEffectiveness } from "../src/context-effectiveness.ts";
import { contextObservationStatus } from "../src/context-observations.ts";
import { digest } from "../src/core.ts";
import { ValidationSubject } from "../src/change-subject.ts";

function fixture(t: any) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "demand-context-"))), old = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q");
  writeFileSync(join(root,".gitignore"),"state/\n");
  mkdirSync(join(root,"config/governance"), { recursive: true });
  writeFileSync(join(root,"config/governance/profile.yaml"), JSON.stringify({ profile_id:"fixture", context_router: { default_route:"project", routes:[{id:"project", primary_context:["rules.md"]}] },
    continuity: { decisions: { mode:"auto", allowed_data_classes:["source","metadata"], allowed_source_paths:["**"], allowed_metadata_paths:["**"],
      consumers: { DL03:{mode:"auto",questions:["context.metadata-relevance/1"]}, DL04:{mode:"auto"} } } } }));
  writeFileSync(join(root,"config/governance/facts.lock.yaml"), JSON.stringify({profile_id:"fixture",facts:{}}));
  writeFileSync(join(root,"rules.md"),"Preserve required instructions.\n");
  writeFileSync(join(root,"parser.ts"),"/** Parse invoice records. */\nexport function parseInvoice() { return 42; }\n");
  git("add",".");git("-c","user.name=Fixture","-c","user.email=fixture@example.invalid","commit","-m","Fixture");
  const assets=resolve("src/project_governance_runtime/assets/skills");
  t.after(()=> { if(old===undefined)delete process.env.XDG_STATE_HOME;else process.env.XDG_STATE_HOME=old;rmSync(root,{recursive:true,force:true}); });
  return {root,assets,git};
}

test("native entry skips optional indexing and injected providers while preserving required instructions",async t=>{
  const f=fixture(t);let reads=0,calls=0;
  const original=ValidationSubject.prototype.readBatch;
  t.mock.method(ValidationSubject.prototype,"readBatch",function(this: ValidationSubject,...args: Parameters<typeof original>){reads++;return original.apply(this,args);});
  const injected:any={async decide(){calls++;throw Error("must not be called");}};
  const route=await contextRouteCommand(["--task","choose a disk format","--revision","1"],f.root,f.assets,injected,{promptEntry:true});
  assert.equal(route.ready,true);assert.equal(route.entries[0]?.content,"Preserve required instructions.\n");
  assert.equal(route.optional,null);assert.equal(route.projection.cache,"skipped");assert.equal(route.timing.indexMs,null);
  assert.equal(reads,0);assert.equal(calls,0);assert.equal(route.selection.retrieval.effective,"none");
});

test("local retrieval admits real matches but no arbitrary dirty-file fallback and never calls a supplied provider",async t=>{
  const f=fixture(t);let calls=0;const injected:any={async decide(){calls++;throw Error("must not be called");}};
  writeFileSync(join(f.root,"parser.ts"),"/** Parse invoice records. */\nexport function parseInvoice() { return 43; }\n");
  const route=await contextRouteCommand(["--task","parseInvoice","--revision","1"],f.root,f.assets,injected);
  assert.ok(route.optional?.entries.some(e=>e.id==="parser.ts"));assert.equal(calls,0);
  const empty=await contextRouteCommand(["--task","quasarxyz","--revision","1"],f.root,f.assets,injected);
  assert.equal(empty.optional,null);assert.equal(empty.selection.reason,"no-local-match");assert.equal(calls,0);
  const index=join(contextStateRoot(f.root),"source-index.sqlite"), prior=readFileSync(index);
  await contextRouteCommand(["--task","quasarxyz","--revision","1","--retrieval","none"],f.root,f.assets);
  assert.deepEqual(readFileSync(index),prior);
  const again=await contextRouteCommand(["--task","parseInvoice","--revision","1"],f.root,f.assets);
  assert.ok(again.projection.reusedCount!>0);
  await assert.rejects(contextRouteCommand(["--task","x","--revision","1","--retrieval","none","--optional-path","parser.ts"],f.root,f.assets),/Optional inputs require/);
});

test("none native entry permits later semantic step zero and exact replay without consuming local steps",async t=>{
  const f=fixture(t),old=process.env.JEV_TOKEN;process.env.JEV_TOKEN="fixture-only";
  t.after(()=>{if(old===undefined)delete process.env.JEV_TOKEN;else process.env.JEV_TOKEN=old;});
  let calls=0;
  t.mock.method(globalThis,"fetch",async(_url:any,init:any)=>{calls++;const wire=JSON.parse(init.body);return Response.json({model:"jev-1.13.0",answers:Object.fromEntries(Object.keys(wire.questions).map(k=>[k,{type:"noul",noul:.99}])),usage:{input_tokens:20,output_tokens:2}});});
  const result:any=await promptContext("codex",{hook_event_name:"UserPromptSubmit",session_id:"demand-session",turn_id:"one",cwd:f.root,prompt:"Research parsing"},f.root,{environment:{},assetRoot:f.assets});
  assert.equal(calls,0);assert.doesNotMatch(result.hookSpecificOutput.additionalContext,/export function/);
  const dir=join(contextStateRoot(f.root),"prompt-entries"),entry=JSON.parse(readFileSync(join(dir,readdirSync(dir)[0]!),"utf8"));
  const args=["--entry",entry.entryId,"--task","parseInvoice"];
  await contextRouteCommand(args,f.root,f.assets,undefined,{session:"demand-session"});assert.equal(calls,0);
  const selected=await contextRouteCommand([...args,"--retrieval","semantic"],f.root,f.assets,undefined,{session:"demand-session"});
  assert.ok(calls>0,JSON.stringify(selected.selection));assert.equal(selected.expansion?.step,0);
  const spent=calls;await contextRouteCommand([...args,"--retrieval","semantic"],f.root,f.assets,undefined,{session:"demand-session"});assert.equal(calls,spent);
  const status=contextObservationStatus(f.root);assert.equal(status.effectiveness.entries,1);assert.equal(status.effectiveness.withLinkedRoute,1);
  assert.equal(status.effectiveness.unknownUsageEntries,1);
});

test("scope-less semantic requests stay local and an unknown retrieval mode is refused",async t=>{
  const f=fixture(t);let calls=0;const injected:any={async decide(){calls++;throw Error("must not run");}};
  const result=await contextRouteCommand(["--task","parseInvoice","--revision","1","--retrieval","semantic"],f.root,f.assets,injected);
  assert.equal(calls,0);assert.equal(result.selection.retrieval.reason,"semantic-scope-unavailable");
  await assert.rejects(contextRouteCommand(["--task","x","--revision","1","--retrieval","auto"],f.root,f.assets),/none\|local\|semantic/);
});

test("effectiveness keeps missing, duplicate and cached usage distinct from complete accepted outcomes",()=>{
  const id=digest("entry").slice(7),other=digest("other").slice(7);
  const record=(collection:string,value:Record<string,unknown>)=>({collection,value});
  const response={kind:"usage",entryId:id,usage:{session:"s",responseId:"r",inputTokens:100,cachedInputTokens:80,outputTokens:null}};
  const result=contextEffectiveness([record("prompt-entries",{entryId:id,provider:"codex",status:"prepared"}),record("prompt-entries",{entryId:other,provider:"codex",status:"prepared"}),record("context-observations",response),record("context-observations",response),record("context-observations",{kind:"usage-collection",state:"no-linked-entries"})],false);
  assert.equal(result.entries,2);assert.equal(result.withNativeUsage,1);assert.equal(result.unknownUsageEntries,1);
  assert.equal(result.nativeUsage.responses,1);assert.deepEqual(result.nativeUsage.fields.inputTokens,{known:100,missing:0});
  assert.deepEqual(result.nativeUsage.fields.outputTokens,{known:null,missing:1});assert.equal(result.nativeUsage.fields.freshInputTokens.known,20);
  assert.equal(result.nativeUsage.partial,true);assert.equal(result.unknownOutcomeEntries,2);assert.equal(result.hostConsumption,"unknown");
});


test("passive status reserves entry coverage despite dense children and reports collection failures", t => {
  const f = fixture(t), root = contextStateRoot(f.root), id = digest("entry").slice(7), older = "2026-10-29T12:00:00Z", current = "2026-10-30T12:00:00Z";
  for (const directory of ["prompt-entries", "context-observations", "routes"]) mkdirSync(join(root, directory), { recursive: true });
  writeFileSync(join(root, "prompt-entries", `${id}.json`), JSON.stringify({ entryId: id, workspace: f.root, provider: "codex", status: "prepared", createdAt: older }));
  for (let i = 0; i < 701; i++) writeFileSync(join(root, "context-observations", `${digest(i).slice(7)}.json`), JSON.stringify({ kind: "usage-collection", createdAt: current, status: "format-unrecognized", collection: { state: "format-unrecognized", invalid: 1 }, unreadableUsageLines: 2 }));
  const result = contextObservationStatus(f.root);
  assert.equal(result.effectiveness.entries, 1); assert.equal(result.truncated, true);
  assert.equal(result.effectiveness.unknownUsageEntries, 1); assert.equal(result.effectiveness.collectionStates["format-unrecognized"], 700);
  assert.equal(result.effectiveness.collectionGaps.unreadableUsageLines, 1400);
  assert.equal(contextObservationStatus(f.root, Date.parse(current)).effectiveness.entries, 0);
  const malformed = contextEffectiveness([{ collection: "routes", value: { selection: [], execution: "invalid" } }, { collection: "context-observations", value: { kind: "usage", entryId: id, usage: [] } }], false);
  assert.equal(malformed.nativeUsage.responses, 0); assert.ok(malformed.orphanObservations > 0);
});

test("semantic intent cannot bypass disabled native metadata or source disclosure through an injected adapter", async t => {
  const f = fixture(t); let calls = 0;
  const profilePath = join(f.root, "config/governance/profile.yaml"), profile = JSON.parse(readFileSync(profilePath, "utf8"));
  profile.continuity.decisions.mode = "off"; writeFileSync(profilePath, JSON.stringify(profile));
  const adapter: any = { async decide() { calls++; throw Error("must not call"); } };
  const standalone = await contextRouteCommand(["--retrieval", "semantic", "--task", "parseInvoice", "--revision", "1", "--decision-task", "fixture"], f.root, f.assets, adapter);
  assert.equal(calls, 0); assert.equal(standalone.selection.retrieval.effective, "local");
  await promptContext("codex", { hook_event_name: "UserPromptSubmit", session_id: "disabled", turn_id: "1", cwd: f.root, prompt: "parseInvoice" }, f.root, { environment: {}, assetRoot: f.assets });
  const result = await contextRouteCommand(["--retrieval", "semantic", "--task", "parseInvoice"], f.root, f.assets, adapter, { session: "disabled" });
  assert.equal(calls, 0); assert.equal(result.metadata, null); assert.equal(result.selection.retrieval.effective, "local");
});

test("unrelated natural language does not admit files through common words or dirty state", async t => {
  const f = fixture(t);
  writeFileSync(join(f.root, "parser.ts"), "/** The parser and the invoice records. Please fix this. */\nexport const invoice=1;\n");
  const result = await contextRouteCommand(["--task", "Please summarise the news and the weather", "--revision", "1"], f.root, f.assets);
  assert.equal(result.optional, null); assert.equal(result.selection.reason, "no-local-match");
});

test("semantic continuation advances three distinct windows and retains exact replay and bounded exhaustion", async t => {
  const f = fixture(t); const token=process.env.JEV_TOKEN;process.env.JEV_TOKEN="fixture-only";t.after(()=>{if(token===undefined)delete process.env.JEV_TOKEN;else process.env.JEV_TOKEN=token;});
  mkdirSync(join(f.root, "src"));
  for (let i = 0; i < 145; i++) writeFileSync(join(f.root, `src/item${String(i).padStart(3,"0")}.ts`), `export const item${i}=1;\n`);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: any, init: any) => {
    calls++; const wire = JSON.parse(init.body);
    return Response.json({model:"jev-1.13.0", answers:Object.fromEntries(Object.keys(wire.questions).map(k=>[k,{type:"noul",noul:.01}]))});
  });
  await promptContext("codex", {hook_event_name:"UserPromptSubmit",session_id:"window-session",turn_id:"one",cwd:f.root,prompt:"Research weather"}, f.root,{environment:{},assetRoot:f.assets});
  const options = {session:"window-session"};
  const first = await contextRouteCommand(["--task","find hidden mechanism","--retrieval","semantic"],f.root,f.assets,undefined,options);
  assert.equal(first.expansion?.step,0); assert.ok(calls>0); assert.equal(first.selection.retrieval.providerAttempted,true);
  const paid = calls;
  const same = await contextRouteCommand(["--entry",first.expansion!.entry!,"--task","find hidden mechanism","--retrieval","semantic"],f.root,f.assets,undefined,options);
  assert.equal(calls,paid);assert.equal(same.expansion?.step,0);
  const second = await contextRouteCommand(first.expansion!.argv!.slice(2) as string[],f.root,f.assets,undefined,options);
  assert.equal(second.expansion?.step,1); assert.ok(calls>paid);
  const secondCalls=calls;
  const third = await contextRouteCommand(second.expansion!.argv!.slice(2) as string[],f.root,f.assets,undefined,options);
  assert.equal(third.expansion?.step,2); assert.ok(calls>secondCalls); assert.equal(third.expansion?.argv,null);
  const exhausted = await contextRouteCommand(["--task","another purpose","--retrieval","semantic"],f.root,f.assets,undefined,options);
  assert.equal(exhausted.selection.retrieval.reason,"family-exhausted");
  assert.equal(exhausted.selection.retrieval.providerAttempted,false);
  const beforeRefusal=calls;
  await assert.rejects(contextRouteCommand(["--task","find mechanism","--retrieval","semantic","--staged"],f.root,f.assets,undefined,options),(error:any)=>error.code==="native-semantic-scope-required");
  assert.equal(calls,beforeRefusal);
  await assert.rejects(contextRouteCommand(["--task","find mechanism","--revision","1","--decision-task","escape","--retrieval","semantic"],f.root,f.assets,undefined,options),/cannot bypass/);
});

test("simultaneous distinct semantic requests cannot reserve the same family's first step twice", async t => {
  const f=fixture(t);const token=process.env.JEV_TOKEN;process.env.JEV_TOKEN="fixture-only";t.after(()=>{if(token===undefined)delete process.env.JEV_TOKEN;else process.env.JEV_TOKEN=token;}); let calls=0, release!:()=>void;
  const waiting=new Promise<void>(resolve=>{release=resolve;}); let entered!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;});
  t.mock.method(globalThis,"fetch",async(_url:any,init:any)=>{calls++;entered();await waiting;const wire=JSON.parse(init.body);return Response.json({model:"jev-1.13.0",answers:Object.fromEntries(Object.keys(wire.questions).map(k=>[k,{type:"noul",noul:.95}]))});});
  await promptContext("codex",{hook_event_name:"UserPromptSubmit",session_id:"race",turn_id:"one",cwd:f.root,prompt:"Inspect invoice"},f.root,{environment:{},assetRoot:f.assets});
  const first=contextRouteCommand(["--task","parseInvoice","--retrieval","semantic"],f.root,f.assets,undefined,{session:"race"});
  await started;
  try {const second=await contextRouteCommand(["--task","different mechanism","--retrieval","semantic"],f.root,f.assets,undefined,{session:"race"});
    assert.equal(second.selection.retrieval.reason,"request-conflict");assert.equal(calls,1);
  } finally {release();await first;}
});

test("effectiveness excludes orphan tokens, deduplicates outcomes and exposes conflicting collection evidence",()=>{
  const id=digest("linked").slice(7),other=digest("outside").slice(7);
  const row=(collection:string,value:Record<string,unknown>)=>({collection,value});
  const usage=(entryId:string,responseId:string,inputTokens:number)=>row("context-observations",{kind:"usage",entryId,usage:{session:"s",responseId,inputTokens}});
  const outcome=(entryId:string,disposition:string)=>row("context-observations",{kind:"outcome",entryId,disposition,evidence:"original-reference"});
  const result=contextEffectiveness([row("prompt-entries",{entryId:id,provider:"codex"}),row("routes",{}),
    row("routes",{execution:{entryId:id},selection:{retrieval:{requested:"none",effective:"none",trigger:"native-prompt",providerAttempted:false}}}),
    row("routes",{execution:{entryId:id},selection:{retrieval:{requested:"semantic",effective:"local",trigger:"explicit-request",providerAttempted:true}}}),
    usage(id,"known",20),usage(id,"conflict",10),usage(id,"conflict",15),usage(other,"orphan",1000),
    outcome(id,"accepted"),outcome(id,"accepted"),outcome(other,"accepted"),
    row("context-observations",{kind:"usage-collection",collection:{state:"observed",unlinkedTurns:2},deferred:{omittedRanges:3,unavailableRanges:4}})],false);
  assert.equal(result.unlinkedRoutes,1);assert.equal(result.withNativeRoute,1);assert.equal(result.withExplicitSemanticRoute,1);assert.equal(result.withExplicitLocalRoute,0);
  assert.equal(result.attemptedRoutes,1);assert.equal(result.nativeUsage.fields.inputTokens.known,20);assert.equal(result.orphanUsage.fields.inputTokens.known,1000);
  assert.equal(result.nativeUsage.fields.inputTokens.missing,1);assert.equal(result.collectionGaps.conflictingResponses,1);
  assert.equal(result.collectionGaps.omittedRanges,3);assert.equal(result.collectionGaps.unavailableRanges,4);assert.equal(result.collectionGaps.unlinkedTurns,2);
  assert.equal(result.outcomeObservations.accepted,1);assert.equal(result.nativeUsage.partial,true);
  const conflicting=contextEffectiveness([row("prompt-entries",{entryId:id}),outcome(id,"accepted"),outcome(id,"reopened")],false);
  assert.equal(conflicting.outcomeObservations.accepted,0);assert.equal(conflicting.outcomeObservations.multipleDispositions,1);
});

test("semantic requests with empty source disclosure do not send originals to an injected provider", async t => {
  const f=fixture(t);const previous=process.env.JEV_TOKEN;process.env.JEV_TOKEN="fixture-only";t.after(()=>{if(previous===undefined)delete process.env.JEV_TOKEN;else process.env.JEV_TOKEN=previous;});
  const path=join(f.root,"config/governance/profile.yaml"),profile=JSON.parse(readFileSync(path,"utf8"));
  profile.continuity.decisions.allowed_source_paths=[];profile.continuity.decisions.allowed_metadata_paths=[];writeFileSync(path,JSON.stringify(profile));
  let calls=0;const provider:any={async decide(){calls++;throw Error("must not transmit");}};
  const result=await contextRouteCommand(["--retrieval","semantic","--task","parseInvoice","--revision","1","--decision-task","disclosure-fixture"],f.root,f.assets,provider);
  assert.equal(calls,0);assert.equal(result.selection.retrieval.providerAttempted,false);
});


test("literal camelCase and snake_case symbols remain local seeds after connective-word filtering",async t=>{
 const f=fixture(t);writeFileSync(join(f.root,"a.ts"),"export function openContextFamily() {}\n");writeFileSync(join(f.root,"b.ts"),"export function load_config() {}\n");
 let calls=0;const provider:any={async decide(){calls++;throw Error("local only");}};
 for(const [symbol,path] of [["openContextFamily","a.ts"],["load_config","b.ts"]]) {
  const packet=await contextRouteCommand(["--task",`Why does ${symbol} return superseded?`,"--revision","1"],f.root,f.assets,provider);
  assert.ok(packet.optional?.entries.some(entry=>entry.id===path));

 }
 assert.equal(calls,0);
});
