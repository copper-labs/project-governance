import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { checkAppleDependencies } from "../src/checkers/apple-dependencies.ts";
const schema = JSON.parse(readFileSync(new URL("../../../src/project_governance_runtime/defaults/schemas/apple-dependency-exception.schema.json", import.meta.url), "utf8"));

test("Apple policy classifies captured deleted commands and requires work-bound approval", async () => {
  const root = mkdtempSync(join(tmpdir(), "apple-dependencies-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
    writeFileSync(join(root, "install.sh"), "pod install\n"); git("add", "."); git("commit", "-qm", "base"); git("rm", "install.sh");
    const scope = resolveChangeScope(root, { staged: true }), subject = new ValidationSubject(root, scope);
    const options = { policy: { applies: "auto" }, exceptions: { version: 1, owner: "team", exceptions: [] as Record<string, unknown>[] }, schema, workId: "work-1", today: "2026-09-20", stage: "pre-commit" };
    assert.equal((await checkAppleDependencies(subject, scope, options)).findings[0]?.rule_id, "apple.cocoapods-exception-required");
    options.exceptions.exceptions.push({ work_id: "work-1", products: ["fixture"], path_globs: ["**/*.sh"], reason: "migration-bridge", rationale: "Preserve integration during the approved migration.", status: "approved", operator: "operator", approved_on: "2026-09-19", expires: "2026-10-01", spm_analysis: "The current integration requires an approved bridge.", compatibility_evidence: ["fixture"], compatibility_tests: ["fixture"], migration_or_deletion_gate: "operator-approved" });
    assert.equal((await checkAppleDependencies(subject, scope, options)).status, "passed");
    assert.equal((await checkAppleDependencies(subject, scope, { ...options, workId: "other" })).status, "failed");
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("Apple discovery does not load unrelated large repository artifacts", async () => {
  const root = mkdtempSync(join(tmpdir(), "apple-discovery-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init", "-q");
    writeFileSync(join(root, "large.bin"), Buffer.alloc(17 * 1024 * 1024));
    const scope = resolveChangeScope(root, { all: true });
    const result = await checkAppleDependencies(new ValidationSubject(root, scope), scope, { policy: { applies: "auto" }, exceptions: {}, schema, workId: "", today: "2026-09-20", stage: "audit" });
    assert.equal(result.status, "not-applicable");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

 test("large staged config scans past the read limit and across stream boundaries", async () => {
  const root = mkdtempSync(join(tmpdir(), "apple-large-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture"); git("commit", "--allow-empty", "-qm", "base"); mkdirSync(join(root,"config"));
    const path=join(root,"config","large.json");
    writeFileSync(path, " ".repeat(17 * 1024 * 1024) + "pod install"); git("add", ".");
    const scope=resolveChangeScope(root,{staged:true});
    writeFileSync(path,"no commands in live file");
    const result=await checkAppleDependencies(new ValidationSubject(root,scope),scope,{policy:{applies:"auto"},exceptions:{version:1,owner:"fixture",exceptions:[]},schema,workId:"",today:"2026-11-07",stage:"pre-commit"});
    assert.ok(result.findings.some(x=>x.rule_id==="apple.cocoapods-exception-required"));
    assert.ok(!result.findings.some(x=>x.rule_id==="apple.input-unavailable"));
  } finally {rmSync(root,{recursive:true,force:true});}
 });
 test("streamed Apple tokens retain case rules and boundary matches", async()=>{
 const {appleTokenSummary}=await import("../src/checkers/apple-source-scan.ts");
 const summary=await appleTokenSummary((async function*(){yield Buffer.from("POD INSTALL PodFi");yield Buffer.from("le bundle exec po");yield Buffer.from("d");})());
 assert.ok(summary.includes("bundle exec pod"));assert.ok(summary.includes("podfile"));assert.ok(!summary.includes("pod install"));
 });

 test("large deleted config retains captured policy evidence", async()=>{
 const root=mkdtempSync(join(tmpdir(),"apple-large-deleted-"));
 const git=(...args:string[])=>execFileSync("git",args,{cwd:root,stdio:"pipe"});
 try {
 git("init","-q");git("config","user.email","fixture@example.invalid");git("config","user.name","Fixture");mkdirSync(join(root,"config"));
 writeFileSync(join(root,"config","large.json")," ".repeat(17*1024*1024)+"pod install");git("add",".");git("commit","-qm","base");git("rm","config/large.json");
 const scope=resolveChangeScope(root,{staged:true});
 const result=await checkAppleDependencies(new ValidationSubject(root,scope),scope,{policy:{applies:"auto"},exceptions:{version:1,owner:"fixture",exceptions:[]},schema,workId:"",today:"2026-11-07",stage:"pre-commit"});
 assert.ok(result.findings.some(x=>x.rule_id==="apple.cocoapods-exception-required"));
 assert.ok(!result.findings.some(x=>x.rule_id==="apple.input-unavailable"));
 }finally{rmSync(root,{recursive:true,force:true});}
 });
 test("large live input failure identifies the file",async()=>{
 const root=mkdtempSync(join(tmpdir(),"apple-large-live-"));
 try{
 execFileSync("git",["init","-q"],{cwd:root});mkdirSync(join(root,"config"));writeFileSync(join(root,"config","large.json")," ".repeat(17*1024*1024));
 const scope=resolveChangeScope(root,{all:true});
 const result=await checkAppleDependencies(new ValidationSubject(root,scope),scope,{policy:{applies:"auto"},exceptions:{},schema,workId:"",today:"2026-11-07",stage:"audit"});
 assert.ok(result.findings.some(x=>x.rule_id==="apple.input-unavailable"&&x.path==="config/large.json"));
 }finally{rmSync(root,{recursive:true,force:true});}
 });

 test("failed streamed Git input cannot return a clean policy summary",async()=>{
 const {appleSource}=await import("../src/checkers/apple-source-scan.ts");
 const {SourceReadLimitError}=await import("../src/change-subject.ts");
 const root=mkdtempSync(join(tmpdir(),"apple-missing-blob-"));
 try{
 execFileSync("git",["init","-q"],{cwd:root});
 await assert.rejects(appleSource(root,{kind:"git",path:"config/missing.json",identity:"0".repeat(40),file_type:"regular"},()=>{throw new SourceReadLimitError(17*1024*1024,16*1024*1024);}),/process did not complete/);
 }finally{rmSync(root,{recursive:true,force:true});}
 });

 test("live verification never falls back to a captured Git blob",async()=>{
 const {appleSource}=await import("../src/checkers/apple-source-scan.ts");
 const {SourceReadLimitError}=await import("../src/change-subject.ts");
 const failure=new SourceReadLimitError(17*1024*1024,16*1024*1024);
 await assert.rejects(appleSource("/nonexistent-fixture",{kind:"git",path:"config/live.json",identity:"0".repeat(40),file_type:"regular"},()=>{throw failure;},true),error=>error===failure);
 });
