import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, chmodSync, rmSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../harness/src/store/store.ts";
import { authorizeProviderAssignment, readProviderAdmission } from "../src/provider-admission.ts";
import { submitProviderJob, submitProviderFollowUp } from "../src/provider-job.ts";
import { waitCommand, submitCommand } from "../src/process-owner.ts";
import { protectedPath } from "../src/provider-guard.ts";
import { authorizeProviderContinuation } from "../src/provider-continuation.ts";
import { validateGuardedDispatch } from "../src/provider-dispatch-guard.ts";
import { qualifiedProviderPair, QUALIFICATION_MAX_AGE_MS } from "../src/provider-qualification.ts";
import { providerAssignmentDoctor } from "../src/provider-doctor.ts";
import { providerCommand } from "../src/provider-command.ts";
import { providerFollowUp } from "../src/provider-follow-up.ts";
import { digest, fileDigest } from "../src/core.ts";
import { routeProviderModel } from "../src/decision-model-routing.ts";

function fixture(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "provider-admission-"))), workspace = join(root, "workspace"), trusted = join(root, "trusted");
  mkdirSync(workspace); mkdirSync(trusted); mkdirSync(join(workspace, "config/governance"), { recursive: true });
  const prior = process.env.XDG_STATE_HOME; process.env.XDG_STATE_HOME = join(trusted, "state");
  t.after(() => { if (prior === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = prior; rmSync(root, { recursive: true, force: true }); });
  const executable = join(trusted, "claude-fixture");
  writeFileSync(executable, `#!${process.execPath}
const args=process.argv; if(args.includes('--version')) { console.log('2.1.267 (Claude Code)'); process.exit(0); }
if(!args.includes('--restricted') || !args.includes('--safe-mode')) process.exit(7);
let input=''; process.stdin.on('data', c=>input+=c); process.stdin.on('end',()=> {
console.log(JSON.stringify({type:'system',subtype:'init',model:args[args.indexOf('--model')+1],effort:args[args.indexOf('--effort')+1],session_id:'guarded-fixture',permissionMode:'dontAsk',tools:['Read','Grep','Glob','StructuredOutput']}));
console.log(JSON.stringify({type:'assistant',message:{content:[{type:'tool_use',id:'read',name:'Read',input:{file_path:'source.ts'}}]}}));
console.log(JSON.stringify({type:'user',message:{content:[{type:'tool_result',tool_use_id:'read',content:'source fixture'}]}}));
console.log(JSON.stringify({type:'result',subtype:'success',structured_output:{outcome:'completed',answer:'summary',artifacts:[],checks:[],sources:['source.ts'],remaining:[]}})); });
`); chmodSync(executable, 0o700);
  const storePath = join(trusted, "authority.sqlite"), store = new Store(storePath);
  const task = store.createTask("Summarize the source", [{ kind: "scope", body: workspace, provenance: "operator" }]); store.close();
  const config = join(trusted, "models.json"); writeFileSync(config, JSON.stringify({ version: 1, providers: { claude: { model: "fixture-baseline", effort: "high", executable } } }));
  const request = { id: "first", provider: "claude" as const, workspace, config, access: "reader" as const, prompt: "Summarize the source", requiredTools: ["read"],
    assignment: { role: "reviewer", constraints: "Do not publish or change files", context: "" }, registry: join(trusted, "registry.sqlite"), deadlineMs: 5000, outputLimit: 100000,
    decision: { version: 1 as const, workspace, taskId: task.taskId, revision: String(task.version), requirement: task.outcome, acceptance: ["Describe the source"], sourcePaths: ["source.ts"] } };
  writeFileSync(join(workspace, "source.ts"), "export const fixture = 1;\n");
  return { root, workspace, trusted, executable, storePath, task, request, config };
}

test("trusted admission rejects unbound overrides and policy drift; fixed native submission and replay are stable", async t => {
  const f = fixture(t), path = join(f.trusted, "admission.json");
  const localOnly = { ...f.request, dataDestination: "local-only" as const };
  assert.throws(() => authorizeProviderAssignment({ store: f.storePath, taskId: f.task.taskId, path, request: localOnly }), /no eligible local provider/);
  await assert.rejects(() => submitProviderJob(join(f.trusted, "local-only"), localOnly), /no eligible local provider/);
  const localPreflight = providerAssignmentDoctor(localOnly, join(f.trusted, "local-only"));
  assert.match(String("detail" in localPreflight && localPreflight.detail), /no eligible local provider/);
  assert.throws(() => authorizeProviderAssignment({ store: f.storePath, taskId: f.task.taskId, path, request: { ...f.request, model: "bypass" } }), /trusted binding/);
  authorizeProviderAssignment({ store: f.storePath, taskId: f.task.taskId, path, request: f.request });
  const request = { ...f.request, admission: path }, directory = join(f.trusted, "job");
  assert.throws(() => readProviderAdmission({ ...request, executable: f.executable }, directory), /changed/);
  assert.throws(() => readProviderAdmission({ ...request, decision: { ...request.decision, revision: "2" } }, directory), /changed/);
  const first = await submitProviderJob(directory, request);
  assert.equal((await waitCommand(directory, first.requestDigest, 10000)).receipt?.state, "succeeded");
  const persisted = JSON.parse(readFileSync(join(directory, "request.json"), "utf8"));
  assert.equal(persisted.provider.guard.kind, "claude-restricted-read");
  assert.equal(persisted.decisionBinding.routing.reason, "fixed-model");
  assert.equal((await submitProviderJob(directory, request)).submitted, false);
  assert.equal(providerAssignmentDoctor(request, join(f.trusted, "preview")).status, "passed");
  validateGuardedDispatch(persisted, directory);
  const altered = structuredClone(persisted); altered.operation.env.EXTRA = "bypass";
  assert.throws(() => validateGuardedDispatch(altered, directory), /differs/);
  const refusedDirectory = join(f.trusted, "refused");
  const refused = submitCommand(refusedDirectory, altered);
  const refusedReceipt = (await waitCommand(refusedDirectory, refused.requestDigest, 10000)).receipt!;
  assert.equal(refusedReceipt.reason, "guarded-admission-changed"); assert.equal(refusedReceipt.cleanup, "confirmed");
  const next = { id: "continued", prompt: "Clarify the same summary", directory: join(f.trusted, "continued") };
  assert.throws(() => submitProviderFollowUp(directory, first.requestDigest, next), /trusted continuation/);
  const continuation = join(f.trusted, "continuation.json");
  assert.throws(() => authorizeProviderContinuation({ parentDirectory: directory, parentDigest: first.requestDigest, next,
    context: { ...request.decision, requirement: "a different task" }, path: continuation }), /new requirement/);
  authorizeProviderContinuation({ parentDirectory: directory, parentDigest: first.requestDigest, next, context: request.decision, path: continuation });
  const continued = submitProviderFollowUp(directory, first.requestDigest, { ...next, admission: continuation });
  assert.equal((await waitCommand(next.directory, continued.requestDigest, 10000)).receipt?.state, "succeeded");
  const continuedRequest = JSON.parse(readFileSync(join(next.directory, "request.json"), "utf8"));
  assert.deepEqual(continuedRequest.provider.guard, persisted.provider.guard);
  validateGuardedDispatch(continuedRequest, next.directory);
  assert.throws(() => submitProviderFollowUp(directory, first.requestDigest, { ...next, prompt: "different prompt", admission: continuation }), /identity changed/);
  const link = join(f.trusted, "dangling"); symlinkSync(join(f.trusted, "missing"), link);
  assert.throws(() => protectedPath(link, [f.workspace]), /symlink/);
  writeFileSync(f.config, JSON.stringify({ version: 1, providers: { claude: { model: "bypass", effort: "high", executable: f.executable } } }));
  await assert.rejects(() => submitProviderJob(directory, request), /changed/);
});

test("routing applies only confident qualified categories; shadow, advice, uncertainty and explicit review preserve the fixed pair", async t => {
  const f = fixture(t), baselinePath = join(f.trusted, "baseline-admission.json"), baselineDir = join(f.trusted, "baseline");
  authorizeProviderAssignment({ store: f.storePath, taskId: f.task.taskId, path: baselinePath, request: f.request,
    operatorOverride: { model: "fixture-baseline", effort: "high", reason: "qualification" } });
  const baseline = await submitProviderJob(baselineDir, { ...f.request, admission: baselinePath });
  assert.equal((await waitCommand(baselineDir, baseline.requestDigest, 10000)).receipt?.state, "succeeded");
  const alternativeRequest = { ...f.request, id: "alternative" }, altPath = join(f.trusted, "alternative-admission.json"), altDir = join(f.trusted, "alternative");
  authorizeProviderAssignment({ store: f.storePath, taskId: f.task.taskId, path: altPath, request: alternativeRequest,
    operatorOverride: { model: "fixture-alternative", effort: "high", reason: "qualification" } });
  const alternative = await submitProviderJob(altDir, { ...alternativeRequest, admission: altPath });
  assert.equal((await waitCommand(altDir, alternative.requestDigest, 10000)).receipt?.state, "succeeded");
  writeFileSync(join(f.workspace, "config/governance/profile.yaml"), JSON.stringify({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["source.ts"], consumers: { DL08: { mode: "auto", effect: "route-model" } } },
    model_routing: { providers: { claude: { assignment_classes: ["bounded-summary"], categories: { summarize: { description: "Summarize supplied evidence", model: "fixture-alternative", effort: "high" } } } } } } }));
  const request = { ...f.request, id: "routed" }, path = join(f.trusted, "routed-admission.json"), directory = join(f.trusted, "routed");
  authorizeProviderAssignment({ store: f.storePath, taskId: f.task.taskId, path, request,
    qualifications: [{ directory: baselineDir, requestDigest: baseline.requestDigest }, { directory: altDir, requestDigest: alternative.requestDigest }] });
  const admission = readProviderAdmission({ ...request, admission: path }, directory)!;
  assert.equal((await routeProviderModel(admission, request.decision, { token: "" })).reason, "missing-token");
  let calls = 0;
  const routed = await routeProviderModel(admission, request.decision, { token: "fixture-only", fetch: async (_url, input) => {
    calls++; const body = String(input?.body); assert.ok(!body.includes("fixture-alternative"));
    return Response.json({ model: "jev-1.13.0", answers: { category: { type: "choice", choice: "summarize", confidence: 0.92, probabilities: { summarize: 0.94, unknown: 0.06 } } } });
  } });
  assert.equal(calls, 1); assert.equal(routed.applied, true); assert.equal(routed.selected.model, "fixture-alternative");
  const sourceRequest = { ...request, admission: path };
  const routedJob = submitCommand(directory, { ...providerCommand({ ...sourceRequest, ...routed.selected }, directory, admission.binding.guard),
    decisionBinding: { submissionDigest: digest({ request: sourceRequest, completion: null }), configDigest: admission.binding.decisionDigest,
      task: request.decision, context: { status: "unavailable", reason: "task-context-unavailable" }, sourceRequest,
      admission, admissionPath: path, routing: routed } });
  assert.equal((await waitCommand(directory, routedJob.requestDigest, 10000)).receipt?.state, "succeeded");
  const next = { id: "routed-continuation", prompt: "Clarify the same summary", directory: join(f.trusted, "routed-continuation") };
  const continuation = join(f.trusted, "routed-continuation.json");
  authorizeProviderContinuation({ parentDirectory: directory, parentDigest: routedJob.requestDigest, next, context: request.decision, path: continuation });
  const continued = providerFollowUp(directory, routedJob.requestDigest, { ...next, admission: continuation });
  const continuedCommand = { ...continued.command, version: 1 as const, ownerDigest: "fixture", parent: continued.parent };
  validateGuardedDispatch(continuedCommand, next.directory);
  const now = Date.now;
  try {
    Date.now = () => now() + QUALIFICATION_MAX_AGE_MS + 1000;
    assert.throws(() => validateGuardedDispatch(continuedCommand, next.directory), /routed capability is no longer qualified/);
  } finally { Date.now = now; }
  const profile = join(f.workspace, "config/governance/profile.yaml"), original = JSON.parse(readFileSync(profile, "utf8"));
  const refs = [{ directory: baselineDir, requestDigest: baseline.requestDigest }, { directory: altDir, requestDigest: alternative.requestDigest }];
  let scenario = 0;
  const evaluate = async (answer: object, mode = "auto", effect = "route-model", override = false) => {
    const setting = structuredClone(original); setting.continuity.decisions.consumers.DL08 = { mode, effect };
    writeFileSync(profile, JSON.stringify(setting));
    const request = { ...f.request, id: `scenario-${scenario++}` }, path = join(f.trusted, `${request.id}.json`);
    authorizeProviderAssignment({ store: f.storePath, taskId: f.task.taskId, path, request, qualifications: refs,
      ...(override ? { operatorOverride: { model: "fixture-baseline", effort: "high", reason: "explicit reviewer" } } : {}) });
    const admitted = readProviderAdmission({ ...request, admission: path }, join(f.trusted, request.id))!;
    let calls = 0;
    const result = await routeProviderModel(admitted, request.decision, { token: "fixture-only", fetch: async () => {
      calls++; return Response.json({ model: "jev-1.13.0", answers: { category: { type: "choice", ...answer } } }); } });
    return { result, calls };
  };
  const confident = { choice: "summarize", confidence: 0.92, probabilities: { summarize: 0.94, unknown: 0.06 } };
  for (const answer of [{ ...confident, confidence: 0.5 }, { ...confident, probabilities: { summarize: 0.51, unknown: 0.49 } },
    { choice: "unknown", confidence: 0.95, probabilities: { unknown: 0.95, summarize: 0.05 } }]) {
    const { result } = await evaluate(answer); assert.equal(result.applied, false);
    assert.equal(result.reason, answer.choice === "unknown" ? "no-usable-answers" : "category-uncertain");
  }
  assert.equal((await evaluate(confident, "shadow")).result.reason, "shadow-baseline");
  assert.equal((await evaluate(confident, "auto", "advise")).result.reason, "category-advice-only");
  const explicit = await evaluate(confident, "auto", "route-model", true);
  assert.equal(explicit.result.reason, "trusted-operator-override"); assert.equal(explicit.calls, 0);
  const qualification = admission.binding;
  assert.throws(() => qualifiedProviderPair(baselineDir, baseline.requestDigest, qualification.guard, qualification.roots,
    qualification.requiredTools, qualification.jobRoot, Date.now() + QUALIFICATION_MAX_AGE_MS + 1000), /expired/);
  assert.throws(() => qualifiedProviderPair(baselineDir, baseline.requestDigest, qualification.guard, qualification.roots, ["write"], qualification.jobRoot), /evidence-mismatch/);
  // A hash-bound native policy denial retains capability; a model-authored blocked result does not.
  const denied = join(f.trusted, "later-policy-denial"); mkdirSync(denied);
  const deniedRequest = JSON.parse(readFileSync(join(baselineDir, "request.json"), "utf8")); deniedRequest.id = "denial";
  writeFileSync(join(denied, "request.json"), JSON.stringify(deniedRequest));
  const nativePath = join(denied, "provider-result.json");
  const native = JSON.parse(readFileSync(join(baselineDir, "provider-result.json"), "utf8"));
  Object.assign(native, { requestDigest: digest(deniedRequest), state: "blocked", policyRefusal: "permission-denied" });
  const persistDenial = () => {
    writeFileSync(nativePath, JSON.stringify(native));
    writeFileSync(join(denied, "result.json"), JSON.stringify({ version: 1, requestDigest: digest(deniedRequest), state: "failed", cleanup: "confirmed",
      endedAt: new Date(Date.now() + 1).toISOString(), reason: "provider-blocked", providerResult: nativePath, providerResultDigest: fileDigest(nativePath) }));
  };
  persistDenial();
  assert.equal(qualifiedProviderPair(baselineDir, baseline.requestDigest, qualification.guard, qualification.roots,
    qualification.requiredTools, qualification.jobRoot).model, "fixture-baseline");
  delete native.policyRefusal; persistDenial();
  assert.throws(() => qualifiedProviderPair(baselineDir, baseline.requestDigest, qualification.guard, qualification.roots,
    qualification.requiredTools, qualification.jobRoot), /later-failure/);
  rmSync(denied, { recursive: true });
  // A later failed native receipt for the same capability invalidates the earlier successful proof.
  const later = join(f.trusted, "later-failure"); mkdirSync(later);
  const retained = JSON.parse(readFileSync(join(baselineDir, "request.json"), "utf8")); retained.id = "later-failure";
  writeFileSync(join(later, "request.json"), JSON.stringify(retained));
  writeFileSync(join(later, "result.json"), JSON.stringify({ version: 1, requestDigest: digest(retained), state: "failed", cleanup: "confirmed",
    endedAt: new Date(Date.now() + 1).toISOString(), reason: "native-capability-failure" }));
  assert.throws(() => qualifiedProviderPair(baselineDir, baseline.requestDigest, qualification.guard, qualification.roots,
    qualification.requiredTools, qualification.jobRoot), /later-failure/);

});


test("guarded entry is independent of routing activation and legacy review never infers consent", async t => {
  const f = fixture(t), profile = join(f.workspace, "config/governance/profile.yaml");
  const settings = { continuity: { decisions: { mode: "off" }, model_routing: { providers: { claude: {
    require_governed_entry: true, assignment_classes: ["bounded-summary"], categories: {} } } } } };
  writeFileSync(profile, JSON.stringify(settings));
  await assert.rejects(() => submitProviderJob(join(f.trusted, "bypass"), f.request), /require_governed_entry/);
  assert.equal(providerAssignmentDoctor(f.request, join(f.trusted, "bypass")).status, "failed");
  writeFileSync(profile, JSON.stringify({ continuity: { decisions: { mode: "auto", consumers: { DL08: { mode: "auto", effect: "route-model" } } } } }));
  writeFileSync(join(f.workspace, "config/governance/model-selection.md"), "Project-owned model choices remain for operator review.");
  assert.throws(() => authorizeProviderAssignment({ store: f.storePath, taskId: f.task.taskId, path: join(f.trusted, "admission.json"), request: f.request }), /Legacy model policy/);
  const hash = digest(readFileSync(join(f.workspace, "config/governance/model-selection.md"), "utf8"));
  authorizeProviderAssignment({ store: f.storePath, taskId: f.task.taskId, path: join(f.trusted, "reviewed.json"), request: f.request, reviewedLegacyPolicyDigest: hash });
  assert.equal(providerAssignmentDoctor({ ...f.request, admission: join(f.trusted, "reviewed.json") }, join(f.trusted, "job")).status, "passed");
});
