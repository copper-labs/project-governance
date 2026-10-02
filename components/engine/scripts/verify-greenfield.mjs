import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Actual installation and ordinary shipped entry points; no initial commit or source imports. */
export async function verifyGreenfield(packageRoot, archive, { live = false } = {}) {
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'governance-greenfield-'))), workspace = join(temporary, 'repo');
  mkdirSync(workspace);
  const environment = { ...process.env, XDG_STATE_HOME: join(temporary, 'state') };
  for (const key of Object.keys(environment)) if (/^(GOVERNANCE_|HARNESS_)/u.test(key)) delete environment[key];
  delete environment.NODE_OPTIONS;
  if (live && !environment.JEV_TOKEN) throw new Error('Live greenfield proof requires JEV_TOKEN');
  if (!live) environment.JEV_TOKEN = 'greenfield-fixture-credential';
  const cli = join(resolve(packageRoot), 'dist/engine/src/cli.js'), registry = join(temporary, 'installation.sqlite');
  const calls = join(temporary, 'calls.jsonl'), preload = join(temporary, 'inference.mjs');
  let hooks, event, launcher;
  const run = (command, args, input) => spawnSync(command, args, { cwd: workspace, env: environment, input, encoding: 'utf8',
    timeout: 50000, maxBuffer: 2 * 1024 * 1024 });
  const invoke = (command, args, input, expected = 0) => {
    const result = run(command, args, input);
    assert.equal(result.status, expected, result.stderr || result.error?.message || result.stdout);
    return JSON.parse(result.stdout);
  };
  const write = (path, content) => { mkdirSync(join(workspace, path, '..'), { recursive: true }); writeFileSync(join(workspace, path), content); };
  const status = () => readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).length;
  try {
    const installed = await initializeGreenfield(packageRoot, archive, { temporary, workspace, registry, cli, environment, preload, calls, invoke, write, live });
    ({ launcher, hooks } = installed);
    const { profile, saveProfile } = installed;
    const largeEvidence = writeLargeEvidence(write);
    event = { session_id: 'greenfield-host', turn_id: 'initial-task', hook_event_name: 'UserPromptSubmit',
      cwd: workspace, prompt: 'Define the example project onboarding acceptance test. According to projects/example/brief.md, what must onboarding preserve? Use the planning skill.' };
    const submit = value => invoke('/bin/sh', ['-c', hooks.UserPromptSubmit[0].hooks[0].command], JSON.stringify(value));
    const submitted = submit(event), text = submitted.hookSpecificOutput.additionalContext;
    assert.match(text, /Retain operator authorization/);
    assert.match(text, /preserve the audit log during onboarding/i);
    const entry = text.match(/Entry ([a-f0-9]{64}); route/)?.[1]; assert.ok(entry, text);
    environment.HARNESS_SESSION = event.session_id;
    const bound = invoke(launcher, ['harness', 'task', 'create', '--outcome', event.prompt, '--scope', workspace]);
    assert.ok(bound.task.taskId);
    assert.equal(bound.contextEntry.status, 'linked');
    const before = live ? null : status(), compact = invoke(launcher, ['context-route', '--entry', entry]);
    assert.equal(compact.presentation, 'selected-context');
    assert.equal(compact.reuse.status, 'validated-entry-replay');
    assert.equal(compact.ready, true);
    // Replay retains the original pre-binding packet; linking must not rewrite its history.
    assert.equal(compact.selection.binding.taskId, null);
    assert.equal(compact.metadata.coverage.applied, true, 'Live success cannot be satisfied by safe fallback');
    assert.equal(compact.metadata.coverage.answeredCount, compact.metadata.coverage.permittedCount);
    assert.ok(compact.optional.entries.some(item => item.id === 'projects/example/brief.md'), JSON.stringify({
      selected: compact.optional.entries.map(item => item.id), metadata: compact.metadata,
      optional: { reason: compact.optional.reason, omitted: compact.optional.omitted, omissions: compact.optional.omissionReasons }, selection: compact.selection }));
    assert.match(compact.optional.entries.find(item => item.id === 'projects/example/brief.md').excerpt,
      /preserve the audit log during onboarding/i);
    assert.equal(compact.projection, undefined); assert.equal(compact.metadata.catalog, undefined);
    const full = invoke(launcher, ['context-route', '--entry', entry, '--json']);
    assert.ok(full.projection); assert.ok(full.metadata.catalog);
    assert.ok(full.metadata.catalog.excluded.some(item => item.path === largeEvidence && item.reason === 'automatic-path-excluded'));
    assert.ok(!full.optional.entries.some(item => item.id === largeEvidence));
    assert.ok(full.selection.passageAdvice.assessedUnitCount > 0);
    assert.ok(full.selection.passageAdvice.positiveCount > 0, JSON.stringify(full.selection.passageAdvice));
    assert.ok(JSON.stringify(compact).length < JSON.stringify(full).length);
    assert.match(compact.entries.find(item => item.path === 'docs/core.md').content, /Retain operator authorization/);
    assert.ok(compact.optional.entries.every(item => /^sha256:[a-f0-9]{64}$/u.test(item.sourceDigest)));
    assert.equal(invoke(launcher, ['doctor', '--capability', 'decisions']).operational.state, 'succeeded');
    if (!live) assert.equal(status(), before, 'Binding and packet replay cannot pay for repeated inference');
    const ordinary = submit({ ...event, turn_id: 'bound-task' });
    const boundEntry = ordinary.hookSpecificOutput.additionalContext.match(/Entry ([a-f0-9]{64}); route/)?.[1];
    assert.ok(boundEntry);
    assert.equal(invoke(launcher, ['context-route', '--entry', boundEntry]).selection.binding.taskId, bound.task.taskId);
    verifyExternalRead({ temporary, launcher, entry, invoke, run });
    if (!live) verifyOfflineRecovery({ environment, profile, saveProfile, status, submit, event, invoke, launcher });
    // The capture regression is proven; generated output is not part of the authored validation fixture.
    rmSync(join(workspace, largeEvidence));
    const checked = invoke(launcher, ['check', '--pack', 'context-router', '--summary']);
    assert.equal(checked.status, 'passed');
    // Context assertions are finished. Convert these fixture docs only for the gate, then end the session.
    const documentationEvidence = verifyDocumentationEvidence({ temporary, launcher, invoke, write, workspace });
    await verifyGenerationCleanup({ packageRoot, invoke, hooks, event, registry });
    return { status: 'passed', suite: 'installed-greenfield', provider: live ? 'live' : 'fixture',
      initialCommit: false, installation: 'passed', nativeEntry: 'passed', firstTask: 'context-delivery-passed', selectedEvidence: 'passed',
      providerProof: { metadata: full.metadata.decisions, coverage: compact.metadata.coverage,
        passages: full.selection.passageAdvice,
        optionalMethod: compact.optional.decision.method, selectedSources: compact.optional.entries.map(item => ({ id: item.id, sourceDigest: item.sourceDigest })) },
      scopeGap: 'detected-without-widening', largeEvidenceCapture: 'passed', compactReplay: 'passed', externalRead: 'passed', documentationEvidence, cleanup: 'passed',
      missingToken: live ? 'offline-suite' : 'passed', billingFailure: live ? 'offline-suite' : 'passed',
      benefit: 'not-evaluated', sourceIdentity: 'synthetic fixture only' };
  } finally {
    if (hooks && event) run('/bin/sh', ['-c', hooks.SessionEnd[0].hooks[0].command], JSON.stringify({ ...event, hook_event_name: 'SessionEnd' }));
    rmSync(temporary, { recursive: true, force: true });
  }
}

/** A saved load-test log must not block the first prompt before any commit exists. */
function writeLargeEvidence(write) {
  const path = 'docs/evidence/context-capture/samples.json';
  const samples = Buffer.alloc(17 * 1024 * 1024, 0x20); samples[0] = 0x5b; samples[samples.length - 1] = 0x5d;
  write(path, samples);
  return path;
}

/** Exercise credential and billing recovery without live inference or changing ordinary entry. */
function verifyOfflineRecovery({ environment, profile, saveProfile, status, submit, event, invoke, launcher }) {
  delete environment.JEV_TOKEN; profile.continuity.decisions.config_revision = 'missing-token'; saveProfile();
  const previous = status(), missing = submit({ ...event, turn_id: 'missing-token' });
  assert.match(missing.hookSpecificOutput.additionalContext, /Retain operator authorization/);
  assert.match(missing.hookSpecificOutput.additionalContext, /Reason: missing-token/);
  assert.equal(status(), previous);
  environment.JEV_TOKEN = 'greenfield-fixture-credential'; environment.GREENFIELD_HTTP_STATUS = '402';
  profile.continuity.decisions.config_revision = 'billing-denied'; saveProfile();
  const denied = submit({ ...event, turn_id: 'billing-denied' });
  assert.match(denied.hookSpecificOutput.additionalContext, /billing-unavailable/);
  assert.match(denied.hookSpecificOutput.additionalContext, /credit/);
  assert.ok(!JSON.stringify(denied).includes('private-provider-response-marker'));
  const health = invoke(launcher, ['doctor', '--capability', 'decisions'], undefined, 1);
  assert.equal(health.operational.state, 'failed'); assert.equal(health.operational.httpStatus, 402);
  delete environment.GREENFIELD_HTTP_STATUS; profile.continuity.decisions.config_revision = 'funded-recovery'; saveProfile();
  submit({ ...event, turn_id: 'funded-recovery' });
  assert.equal(invoke(launcher, ['doctor', '--capability', 'decisions']).operational.state, 'succeeded');
}

/** End native ownership and prove that neither a reader nor a maintenance reservation survives. */
async function verifyGenerationCleanup({ packageRoot, invoke, hooks, event, registry }) {
  const { RuntimeGenerations } = await import(pathToFileURL(join(packageRoot, 'dist/engine/src/runtime-generations.js')));
  invoke('/bin/sh', ['-c', hooks.SessionEnd[0].hooks[0].command], JSON.stringify({ ...event, hook_event_name: 'SessionEnd' }));
  const generations = new RuntimeGenerations(registry);
  try { assert.equal(generations.state().readers.length, 0); assert.equal(generations.state().maintenance, null); } finally { generations.close(); }
}

/** A new project can save raw review output without weakening its live documentation gate. */
function verifyDocumentationEvidence({ temporary, launcher, invoke, write, workspace }) {
  const authored = (id, body, status = 'current', type = 'guide') =>
    `---\nid: ${id}\ntitle: Example\ntype: ${type}\nstatus: ${status}\nowner: team\ncreated: 2026-10-01\nupdated: 2026-10-01\nsummary: Example document\n---\n${body}`;
  for (const path of ['docs/core.md', 'docs/onboarding.md']) write(path, authored(path, readFileSync(join(workspace, path), 'utf8')));
  const source = authored('proposal', '# Proposal\nProposed behavior.\n', 'proposal', 'spec');
  write('docs/proposal.md', source);
  write('docs/decision.md', authored('decision', '# Decision\nChosen approach.\n', 'accepted', 'decision'));
  const copy = 'docs/implementation/evidence/review/after/docs/proposal.md';
  const snapshot = source + '[Original location](../../missing-original.md)\n';
  const artifacts = { [copy]: snapshot,
    'docs/implementation/evidence/review/before/index.md': '[Frozen reference](absent.md)\n',
    'docs/implementation/evidence/review/raw-review.md': '[Reviewer reference](missing.md)\n' };
  for (const [path, content] of Object.entries(artifacts)) write(path, content);
  const summaryPath = 'docs/implementation/evidence/review/README.md', summary = authored('review', '[Raw report](raw-review.md)\n');
  write(summaryPath, summary);
  const args = ['check', '--stage', 'pre-commit', '--mode', 'all', '--pack', 'documentation', '--summary'];
  assert.equal(invoke(launcher, args).status, 'passed');
  execFileSync('git', ['add', '.'], { cwd: workspace });
  assert.equal(invoke(launcher, ['check', '--stage', 'pre-commit', '--mode', 'impacted', '--staged', '--pack', 'documentation', '--summary']).status, 'passed');
  write('docs/live-guide.md', authored('live-guide', '[Missing live target](missing-live.md)\n'));
  write(summaryPath, authored('review', '[Missing evidence summary target](missing-summary.md)\n'));
  const resultPath = join(temporary, 'documentation-failure.json');
  assert.equal(invoke(launcher, [...args, '--json-output', resultPath], undefined, 1).status, 'failed');
  assert.match(readFileSync(resultPath, 'utf8'), /docs\/live-guide\.md: link target does not exist: missing-live\.md/);
  assert.match(readFileSync(resultPath, 'utf8'), /docs\/implementation\/evidence\/review\/README\.md: link target does not exist: missing-summary\.md/);
  write('docs/live-guide.md', authored('live-guide', '# Live guide\nVerified current guidance.\n'));
  write(summaryPath, summary);
  assert.equal(invoke(launcher, args).status, 'passed');
  for (const [path, content] of Object.entries(artifacts)) assert.equal(readFileSync(join(workspace, path), 'utf8'), content);
  return 'passed';
}

/** External read observations must retain identity without relaxing local path protections. */
function verifyExternalRead({ temporary, launcher, entry, invoke, run }) {
  const external = join(temporary, 'external'); mkdirSync(external); execFileSync('git', ['init', '-q'], { cwd: external });
  writeFileSync(join(external, 'source.md'), '# Referenced source\nVerified external evidence.\n');
  assert.equal(invoke(launcher, ['telemetry', 'context', 'expansion', '--entry', entry, '--source-workspace', external, '--path', 'source.md']).recorded, true);
  const observations = invoke(launcher, ['telemetry', 'context', 'status']);
  assert.equal(observations.reads.external, 1); assert.equal(observations.reads.local, 0);
  const unsafe = run(launcher, ['telemetry', 'context', 'expansion', '--entry', entry, '--source-workspace', external, '--path', '../source.md']);
  assert.notEqual(unsafe.status, 0);
}

/** Keep installation and the explicitly approved fixture separate from the first-task assertions. */
async function initializeGreenfield(packageRoot, archive, { temporary, workspace, registry, cli, environment, preload, calls, invoke, write, live }) {
  execFileSync('git', ['init', '-q'], { cwd: workspace });
  const { runtimeMigrationPlan } = await import(pathToFileURL(join(packageRoot, 'dist/engine/src/runtime-migration-plan.js')));
  const plan = runtimeMigrationPlan(workspace), planPath = join(temporary, 'plan.json'), requestPath = join(temporary, 'request.json');
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  const lock = { schema_version: 2, package: manifest.name, version: manifest.version,
    artifact: { url: pathToFileURL(archive).href, integrity: 'sha512-' + createHash('sha512').update(readFileSync(archive)).digest('base64') },
    source_commit: 'a'.repeat(40), node: manifest.engines.node, configuration_schema: 1 };
  writeFileSync(planPath, JSON.stringify(plan));
  writeFileSync(requestPath, JSON.stringify({ mode: 'init', workspace, registry, archive, lock,
    expectedRevision: 0, inputs: plan.inputs, hostPlan: plan.hostPlan }));
  assert.equal(invoke(process.execPath, [cli, 'init', '--request-file', requestPath, '--project-plan', planPath,
    '--operation-directory', join(temporary, 'operation')]).state.maintenance, null);
  const launcher = join(workspace, '.governance/runtime/bin/project-governance');
  const hooks = JSON.parse(readFileSync(join(workspace, '.codex/hooks.json'), 'utf8')).hooks;
  assert.equal(spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: workspace }).status, 128);
  // The project gains knowledge after installation; the initial profile must not silently approve it.
  write('docs/core.md', '# Core guidance\nRetain operator authorization and cite the original evidence.\n');
  write('docs/onboarding.md', '# Onboarding\nPreserve the original project brief and its source references.\n');
  write('projects/example/brief.md', '# Example project brief\nThe acceptance requirement is to preserve the audit log during onboarding.\n');
  write('.agents/skills/planning/SKILL.md', '# Project planning\nRead the project brief before proposing milestones.\n');
  write('projects/example/noise.md', '# Archived unrelated notes\n' + 'Old unrelated information.\n'.repeat(150));
  const profile = { context_router: { default_route: 'project', default_context: ['docs/core.md'],
    procedure_sources: ['docs/onboarding.md'], routes: [{ id: 'project', token_budget: {
      primary_context_tokens: 1500, active_plan_context_tokens: 500, expansion_context_tokens: 1500, total_context_tokens: 3500 } }] },
    continuity: { decisions: { mode: 'auto', config_revision: 'greenfield',
      allowed_data_classes: ['metadata', 'source'], allowed_metadata_paths: ['docs/**'], allowed_source_paths: ['docs/**'],
      budget: { max_calls: 16, max_request_bytes: 262144 }, consumers: { DL03: { mode: 'auto', effect: 'advise',
        questions: ['context.metadata-relevance/1', 'context.relevance/1', 'context.passage-evidence/1', 'context.passage-role/1'] } } } } };
  const saveProfile = () => write('config/governance/profile.yaml', JSON.stringify(profile));
  saveProfile();
  const restricted = invoke(launcher, ['doctor', '--capability', 'context']).scopeCoverage;
  assert.equal(restricted.status, 'restricted');
  assert.ok(restricted.metadataNotPermittedPreview.includes('projects/example/brief.md'));
  assert.ok(restricted.metadataNotPermittedPreview.includes('.agents/skills/planning/SKILL.md'));
  assert.equal(invoke(launcher, ['doctor', '--capability', 'decisions']).operational.state, 'not-observed');
  profile.continuity.decisions.allowed_metadata_paths.push('projects/**', '.agents/skills/**');
  profile.continuity.decisions.allowed_source_paths.push('projects/**', '.agents/skills/**'); saveProfile();
  if (!live) {
    writeFileSync(preload, "import {appendFileSync} from 'node:fs'; globalThis.fetch=" + (async (url, init) => {
      if (url !== 'https://api.typesafe.ai/v1/systemone') throw Error('Unexpected provider');
      const wire = JSON.parse(init.body);
      const { appendFileSync } = await import('node:fs');
      appendFileSync(process.env.GREENFIELD_CALLS, JSON.stringify({ questionCount: Object.keys(wire.questions).length }) + '\n');
      if (process.env.GREENFIELD_HTTP_STATUS === '402') return new Response('private-provider-response-marker', { status: 402 });
      if (wire.state.layout !== 'compact-v1') throw Error('Expected actual compact request contract');
      return Response.json({ model: wire.model, usage: { input_tokens: 100, output_tokens: 10 },
        answers: Object.fromEntries(Object.entries(wire.questions).map(([name, question]) => {
          const key = question.instructions.question.match(/state\.items\.(c\d+)/)?.[1], item = wire.state.items[key];
            if (!item) throw Error('Missing issued source');
            if (question.type === 'choice') {
              const keys = Object.keys(question.criteria), choice = keys.includes('documentation') ? 'documentation' : 'unknown';
              return [name, { type: 'choice', choice, confidence: 0.98,
                probabilities: Object.fromEntries(keys.map(key => [key, key === choice ? 1 : 0])) }];
            }
          return [name, { type: 'noul', noul: item.path?.includes('noise') ? 0.02 : 0.98 }];
        })) });
    }).toString() + ';');
    environment.NODE_OPTIONS = '--import ' + pathToFileURL(preload).href;
    environment.GREENFIELD_CALLS = calls;
  }
  return { launcher, hooks, profile, saveProfile };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const archive = resolve(process.argv[2] || ''), live = process.argv.includes('--live');
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'greenfield-package-')));
  try {
    execFileSync('npm', ['install', '--prefix', temporary, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', archive], { stdio: 'pipe', timeout: 60000 });
    console.log(JSON.stringify(await verifyGreenfield(join(temporary, 'node_modules/@organta/project-governance'), archive, { live })));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
