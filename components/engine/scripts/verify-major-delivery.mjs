import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const planPath = 'docs/exec-plans/active/delivery.md', specificationPath = 'docs/specs/delivery.md';
const profilePath = 'config/governance/profile.yaml', packPath = 'config/validation/packs/lint-delivery.yaml';
const checkerPath = 'tools/lint-delivery.fixture', sourcePath = 'src/DeliveryOwner.kt';
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const document = (id, type, status, body) => `---\nid: ${id}\ntitle: Delivery fixture\ntype: ${type}\nstatus: ${status}\nowner: fixture\ncreated: 2026-10-05\nupdated: 2026-10-05\nsummary: Synthetic delivery contract\n---\n\n${body}`;

/** Deliberately adopted machine slots; the semantic claim has no invented acceptance state. */
export function deliveryDocuments(taskId = 'synthetic-delivery-task', revision = '1') {
  const specification = document('spec.delivery', 'spec', 'approved', `# Delivery\n\nRetain the original owner and explain its authority.\n\n\`\`\`governance-spec\n${JSON.stringify({ version: 1, criteria: [
    { id: 'R1', claim: 'The captured source retains its declared owner.', verification: 'mechanical' },
    { id: 'R2', claim: 'The explanation communicates the ownership boundary clearly.', verification: 'semantic' },
  ] }, null, 2)}\n\`\`\`\n`);
  const declaration = { version: 1, specifications: [{ path: specificationPath, digest: digest(specification), criteria: ['R1', 'R2'] }],
    batches: [{ id: 'B1', depends_on: [], items: [
      { id: 'B1.I', kind: 'implementation', criteria: [{ path: specificationPath, id: 'R1' }, { path: specificationPath, id: 'R2' }] },
      { id: 'B1.V', kind: 'verification', requires: ['B1.I'], criteria: [{ path: specificationPath, id: 'R1' }],
        check: { stage: 'batch', packs: ['lint-delivery'], task_id: taskId, task_revision: revision } },
      { id: 'B1.C', kind: 'closeout', requires: ['B1.I', 'B1.V'] },
    ] }] };
  const slots = ['I', 'V', 'C'].map(id => `<!-- governance:item B1.${id} -->\n- [ ] ${id === 'I' ? 'Implement' : id === 'V' ? 'Verify' : 'Close out'} the declared batch.\n<!-- governance:evidence B1.${id} -->[]<!-- /governance:evidence -->`).join('\n\n');
  return { specification, declaration, plan: document('plan.delivery', 'exec-plan', 'active', `# Delivery plan\n\nKeep this authored rationale exact.\n\n\`\`\`governance-plan\n${JSON.stringify(declaration, null, 2)}\n\`\`\`\n\n${slots}\n\nCurrent/next: caller-owned narrative.\n`) };
}

/** A small project-owned fixture checks captured bytes. It is not a Kotlin tool qualification. */
export function deliveryChecker(journal) {
  return `const {readFileSync,appendFileSync}=require('node:fs'),{createHash}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
appendFileSync(${JSON.stringify(journal)},JSON.stringify({run_id:process.env.PROJECT_GOVERNANCE_RUN_ID})+'\\n');
try {
  const bytes=readFileSync(process.env.PROJECT_GOVERNANCE_CHANGE_PACKET);
  if(hash(bytes)!==process.env.PROJECT_GOVERNANCE_CHANGE_PACKET_SHA256)throw new Error('Packet changed');
  const packet=JSON.parse(bytes);
  if(!packet.subject_digest||packet.subject_digest!==process.env.PROJECT_GOVERNANCE_SUBJECT_DIGEST)throw new Error('Exact subject required');
  const paths=${JSON.stringify([sourcePath, checkerPath, profilePath, packPath, specificationPath])};
  const files=paths.map(path=>{
    const record=packet.records.find(record=>record.path===path);
    if(!record||record.after_file_type!=='regular'||!record.after_path)throw new Error('Captured input missing: '+path);
    const bytes=readFileSync(record.after_path);
    if(hash(bytes)!==record.after_sha256)throw new Error('Snapshot changed: '+path);
    return {path,sha256:hash(bytes)};
  });
  const source=packet.records.find(record=>record.path===${JSON.stringify(sourcePath)});
  const findings=readFileSync(source.after_path,'utf8').includes('val owner = "retained"')?[]:[{rule_id:'fixture.delivery-owner',severity:'blocking',path:${JSON.stringify(sourcePath)},message:'Declared owner missing'}];
  console.log(JSON.stringify({status:findings.length?'failed':'passed',findings,input_manifest:{version:1,status:'complete',files},evidence:{subject_digest:packet.subject_digest}}));
}catch(error){console.log(JSON.stringify({status:'failed',findings:[{rule_id:'fixture.delivery-input',severity:'blocking',message:error.message}]}));process.exitCode=2;}
`;
}

/** Existing archive verification/installation, followed only by ordinary shipped commands. */
export async function verifyMajorDelivery(packageRoot, archive) {
  const pkg = resolve(packageRoot), archivePath = resolve(archive), manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
  assert.equal(manifest.name, '@organta/project-governance');
  const cli = join(pkg, 'dist/engine/src/cli.js'), temporary = realpathSync(mkdtempSync(join(tmpdir(), 'governance-major-delivery-')));
  const { runtimeMigrationPlan } = await import(pathToFileURL(join(pkg, 'dist/engine/src/runtime-migration-plan.js')));
  const { RuntimeGenerations } = await import(pathToFileURL(join(pkg, 'dist/engine/src/runtime-generations.js')));
  const { parse, stringify } = await import(pathToFileURL(join(pkg, 'node_modules/yaml/dist/index.js')));
  const { normalizedPlanContent, parseImplementationPlan } = await import(pathToFileURL(join(pkg, 'dist/engine/src/implementation-plan.js')));
  const { digest: canonicalDigest } = await import(pathToFileURL(join(pkg, 'dist/engine/src/core.js')));
  const networkJournal = join(temporary, 'network.jsonl'), preload = join(temporary, 'no-network.mjs');
  writeFileSync(preload, `import {appendFileSync} from 'node:fs';\nglobalThis.fetch=async (...args)=>{appendFileSync(${JSON.stringify(networkJournal)},JSON.stringify({url:String(args[0])})+'\\n');throw new Error('Synthetic delivery forbids inference');};\n`);
  const environment = { ...process.env, XDG_STATE_HOME: join(temporary, 'state'), NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` };
  for (const key of Object.keys(environment)) if (/^(GOVERNANCE_|HARNESS_)/u.test(key) || /(?:TOKEN|API_KEY)$/u.test(key)) delete environment[key];
  const dispatches = [], installations = [], journal = join(temporary, 'native-checks.jsonl');
  const write = (repo, path, bytes) => { mkdirSync(join(repo, path, '..'), { recursive: true }); writeFileSync(join(repo, path), bytes); };
  const invoke = (repo, label, command, args, expected = 0) => {
    const started = performance.now(), result = spawnSync(command, args, { cwd: repo, env: environment, encoding: 'utf8', timeout: 45000, maxBuffer: 4 * 1024 * 1024 });
    const receipt = { label, command, args, exit_code: result.status, signal: result.signal, timed_out: result.error?.code === 'ETIMEDOUT', elapsed_ms: Math.round(performance.now() - started) };
    dispatches.push(receipt); writeFileSync(join(temporary, `${label}.stdout`), result.stdout ?? ''); writeFileSync(join(temporary, `${label}.stderr`), result.stderr ?? '');
    assert.equal(receipt.timed_out, false, `${label} exceeded the public command deadline`);
    assert.equal(result.status, expected, `${label}: ${result.stderr || result.error?.message || result.stdout}`);
    return result.stdout.trim() ? JSON.parse(result.stdout) : JSON.parse(result.stderr.trim().split('\n').at(-1));
  };
  const install = async name => {
    const repo = join(temporary, name), registry = join(temporary, `${name}.sqlite`); mkdirSync(repo);
    execFileSync('git', ['init', '-q'], { cwd: repo, stdio: 'pipe' });
    const plan = runtimeMigrationPlan(repo), planFile = join(temporary, `${name}-migration.json`), requestFile = join(temporary, `${name}-init.json`);
    const lock = { schema_version: 2, package: manifest.name, version: manifest.version,
      artifact: { url: pathToFileURL(archivePath).href, integrity: 'sha512-' + createHash('sha512').update(readFileSync(archivePath)).digest('base64') },
      source_commit: 'a'.repeat(40), node: manifest.engines.node, configuration_schema: 1 };
    writeFileSync(planFile, JSON.stringify(plan)); writeFileSync(requestFile, JSON.stringify({ mode: 'init', workspace: repo, registry, archive: archivePath, lock, expectedRevision: 0, inputs: plan.inputs, hostPlan: plan.hostPlan }));
    const result = invoke(repo, `${name}-init`, process.execPath, [cli, 'init', '--request-file', requestFile, '--project-plan', planFile, '--operation-directory', join(temporary, `${name}-operation`)]);
    assert.equal(result.state.maintenance, null);
    const launcher = join(repo, '.governance/runtime/bin/project-governance');
    const profile = parse(readFileSync(join(repo, profilePath), 'utf8'));
    assert.deepEqual(profile.lint, { version: 1, require_first_source: true, requirements: [], exclusions: [] });
    assert.equal(spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: repo }).status, 128);
    installations.push({ repo, registry, launcher, profile }); return installations.at(-1);
  };
  const runCount = () => {
    const root = join(environment.XDG_STATE_HOME, 'project-governance/check-runs');
    return existsSync(root) ? readdirSync(root).filter(name => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(name)).length : 0;
  };
  const nativeCount = () => existsSync(journal) ? readFileSync(journal, 'utf8').trim().split('\n').filter(Boolean).length : 0;
  let failure;
  try {
    const main = await install('repo'), { repo, launcher, profile } = main;
    const call = (label, args, expected = 0) => invoke(repo, label, launcher, args, expected);
    const empty = call('empty-plan', ['plan', '--stage', 'pre-push', '--mode', 'all', '--pack', 'documentation']);
    assert.equal(empty.status, 'ready'); assert.deepEqual(empty.blockers, []);
    write(repo, sourcePath, 'class DeliveryOwner { val owner = "retained" }\n');
    const uncovered = call('first-source-refusal', ['plan', '--stage', 'pre-push', '--mode', 'all', '--pack', 'documentation'], 1);
    assert.ok(uncovered.blockers.some(finding => finding.code === 'lint-first-source-uncovered' && finding.path === sourcePath));
    assert.equal(runCount(), 0); assert.equal(nativeCount(), 0);
    const documents = deliveryDocuments();
    write(repo, specificationPath, documents.specification); write(repo, planPath, documents.plan); chmodSync(join(repo, planPath), 0o640);
    write(repo, 'docs/exec-plans/README.md', document('plans.delivery', 'guide', 'current', '# Plans\n\n[Delivery](active/delivery.md)\n'));
    write(repo, checkerPath, deliveryChecker(journal));
    write(repo, packPath, stringify({ id: 'lint-delivery', enforcement: 'blocking', stages: ['batch', 'pre-commit'], run_when: 'matched',
      path_globs: ['**'], change_packet_contract: 1, commands: [{ run: [process.execPath, checkerPath] }] }));
    profile.lint.requirements.push({ pack_id: 'lint-delivery', roots: ['src'], stages: ['batch', 'pre-commit'] });
    profile.continuity = { decisions: { mode: 'off' } }; write(repo, profilePath, stringify(profile));
    const fixedPath = 'config/governance/providers.json', fixed = JSON.stringify({ version: 1, providers: { claude: { model: 'fixture-fixed-model', effort: 'high' } } }) + '\n';
    write(repo, fixedPath, fixed);
    const contextPath = join(temporary, 'task-context.json'); writeFileSync(contextPath, JSON.stringify({ version: 1, workspace: repo, taskId: 'synthetic-delivery-task', revision: '1',
      requirement: 'Retain the declared fixture owner', acceptance: ['Captured source retains the owner'], sourcePaths: ['src'] }));
    environment.GOVERNANCE_DECISION_CONTEXT = contextPath;
    assert.equal(call('adopted-plan', ['plan', '--stage', 'batch', '--mode', 'impacted', '--base-ref', 'HEAD']).status, 'ready');
    const inspect = label => call(label, ['implementation-plan', 'inspect', '--path', planPath, '--batch', 'B1']);
    const update = (label, request, expected = 0) => {
      const path = join(temporary, `${label}-request.json`); writeFileSync(path, JSON.stringify(request));
      return call(label, ['implementation-plan', 'update', '--path', planPath, '--request', path, '--base-ref', 'HEAD'], expected);
    };
    const initial = inspect('batch-inspect'), implementation = { version: 1, expected_digest: initial.plan_digest, batch: 'B1', updates: [{ id: 'B1.I', completed: true }] };
    assert.equal(initial.items.length, 3); assert.ok(initial.items.every(item => !item.completed));
    assert.equal(update('implementation-update', implementation).status, 'updated');
    assert.equal(update('implementation-repeat', implementation).status, 'unchanged');
    const beforeCheck = inspect('implementation-inspect');
    assert.equal(beforeCheck.items[0].evidence.at(-1).kind, 'caller-declaration');
    const originalNarrative = normalizedPlanContent(parseImplementationPlan(planPath, documents.plan));
    const refusedWithoutExecution = (label, action) => {
      const before = { runs: runCount(), native: nativeCount(), bytes: readFileSync(join(repo, planPath)) };
      action(); assert.equal(runCount(), before.runs, `${label} must not dispatch another check`); assert.equal(nativeCount(), before.native);
      assert.deepEqual(readFileSync(join(repo, planPath)), before.bytes, `${label} must preserve the plan`);
    };
    refusedWithoutExecution('stale-request', () => update('stale-request', { ...implementation, updates: [{ id: 'B1.C', completed: true }] }, 2));
    refusedWithoutExecution('wrong-batch', () => call('wrong-batch', ['check', '--stage', 'batch', '--base-ref', 'HEAD', '--implementation-plan', planPath, '--batch', 'missing'], 2));
    assert.equal(runCount(), 0); assert.equal(nativeCount(), 0);
    const batch = call('bound-batch', ['check', '--stage', 'batch', '--mode', 'impacted', '--base-ref', 'HEAD', '--implementation-plan', planPath, '--batch', 'B1', '--trigger', 'test', '--timeout-seconds', '15']);
    assert.equal(batch.status, 'passed'); assert.equal(batch.planProgress.status, 'updated');
    assert.equal(runCount(), 1); assert.equal(nativeCount(), 1);
    const originalPath = join(batch.run_directory, 'result.json'), originalBytes = readFileSync(originalPath), original = JSON.parse(originalBytes);
    const completed = batch.planProgress.items.find(item => item.id === 'B1.V'), evidence = completed.evidence.at(-1);
    assert.equal(completed.completed, true); assert.equal(evidence.kind, 'native-check'); assert.equal(evidence.run_id, batch.run_id);
    assert.equal(evidence.result_digest, canonicalDigest(original)); assert.deepEqual(original.plan.selected_packs, ['lint-delivery']);
    assert.equal(evidence.task_id, 'synthetic-delivery-task'); assert.equal(evidence.task_revision, '1');
    assert.deepEqual(evidence.packs, ['lint-delivery']); assert.equal(evidence.subject_digest, JSON.parse(readFileSync(join(batch.run_directory, 'run.json'))).scope.subject_digest);
    const native = original.results.find(pack => pack.pack_id === 'lint-delivery').commands;
    assert.equal(native.length, 1); assert.equal(native[0].command_receipt.cleanup, 'confirmed'); assert.equal(native[0].input_manifest.status, 'complete');
    const repeatedVerification = { version: 1, expected_digest: beforeCheck.plan_digest, batch: 'B1', updates: [{ id: 'B1.V', completed: true, run_id: batch.run_id }] };
    refusedWithoutExecution('verification-repeat', () => assert.equal(update('verification-repeat', repeatedVerification).status, 'unchanged'));
    const checked = inspect('checked-inspect');
    refusedWithoutExecution('wrong-run', () => update('wrong-run', { ...repeatedVerification, expected_digest: checked.plan_digest, updates: [{ id: 'B1.V', completed: true, run_id: '00000000-0000-0000-0000-000000000000' }] }, 2));
    write(repo, sourcePath, 'class DeliveryOwner { val owner = "changed" }\n');
    refusedWithoutExecution('stale-source', () => update('stale-source', { ...repeatedVerification, expected_digest: checked.plan_digest }, 2));
    write(repo, sourcePath, 'class DeliveryOwner { val owner = "retained" }\n');
    assert.equal(normalizedPlanContent(parseImplementationPlan(planPath, readFileSync(join(repo, planPath), 'utf8'))), originalNarrative);
    assert.equal(statSync(join(repo, planPath)).mode & 0o777, 0o640);
    const docsArgs = ['check', '--stage', 'pre-push', '--mode', 'impacted', '--base-ref', 'HEAD', '--pack', 'documentation', '--trigger', 'test', '--timeout-seconds', '15'];
    assert.equal(call('documentation-valid', docsArgs).status, 'passed');
    const savedPlan = readFileSync(join(repo, planPath)), wrongDeclaration = structuredClone(documents.declaration);
    wrongDeclaration.batches[0].items[0].criteria[1].id = 'R404';
    write(repo, planPath, savedPlan.toString('utf8').replace(JSON.stringify(documents.declaration, null, 2), JSON.stringify(wrongDeclaration, null, 2)));
    refusedWithoutExecution('wrong-spec-reference-update', () => update('wrong-spec-reference-update', { ...repeatedVerification, expected_digest: digest(readFileSync(join(repo, planPath))) }, 2));
    const wrongReference = call('documentation-wrong-reference', docsArgs, 1);
    assert.ok(JSON.stringify(wrongReference).includes('specification.criterion-unresolved')); write(repo, planPath, savedPlan);
    write(repo, specificationPath, documents.specification.replace('Retain the original owner', 'Change the original owner'));
    const specDrift = call('documentation-spec-drift', docsArgs, 1);
    assert.ok(JSON.stringify(specDrift).includes('specification.digest-mismatch')); write(repo, specificationPath, documents.specification);
    assert.equal(call('documentation-corrected', docsArgs).status, 'passed');
    assert.equal(nativeCount(), 1); assert.deepEqual(readFileSync(originalPath), originalBytes);
    assert.deepEqual(readFileSync(join(repo, specificationPath), 'utf8'), documents.specification);
    assert.deepEqual(readFileSync(join(repo, fixedPath), 'utf8'), fixed);
    delete environment.GOVERNANCE_DECISION_CONTEXT;
    const setup = await install('setup'), setupCall = (label, args, expected = 0) => invoke(setup.repo, label, setup.launcher, args, expected);
    write(setup.repo, 'example.py', 'answer = 42\n');
    const setupBefore = readFileSync(join(setup.repo, profilePath)), setupRuns = runCount();
    const proposal = setupCall('lint-setup-dry-run', ['lint', 'setup']);
    assert.equal(proposal.mutations, 'none'); assert.equal(proposal.status, 'proposed'); assert.ok(proposal.files.some(file => file.path === 'ruff.toml'));
    assert.equal(existsSync(join(setup.repo, 'ruff.toml')), false); assert.deepEqual(readFileSync(join(setup.repo, profilePath)), setupBefore);
    setupCall('lint-setup-stale-digest', ['lint', 'setup', '--apply', '--plan-digest', 'sha256:' + '0'.repeat(64)], 2);
    assert.equal(existsSync(join(setup.repo, 'ruff.toml')), false); assert.deepEqual(readFileSync(join(setup.repo, profilePath)), setupBefore);
    const installed = setupCall('lint-setup-apply', ['lint', 'setup', '--apply', '--plan-digest', proposal.plan_digest]);
    assert.equal(installed.status, 'installed'); assert.equal(installed.acquisition, 'not-performed'); assert.equal(installed.checks, 'not-performed');
    for (const file of proposal.files) assert.equal(readFileSync(join(setup.repo, file.path), 'utf8'), file.content);
    const stable = proposal.files.map(file => ({ path: file.path, digest: digest(readFileSync(join(setup.repo, file.path))), mode: statSync(join(setup.repo, file.path)).mode & 0o777 }));
    const repeat = setupCall('lint-setup-repeat-proposal', ['lint', 'setup']); assert.deepEqual(repeat.files, []);
    assert.equal(setupCall('lint-setup-repeat-apply', ['lint', 'setup', '--apply', '--plan-digest', repeat.plan_digest]).status, 'unchanged');
    assert.deepEqual(stable, stable.map(file => ({ ...file, digest: digest(readFileSync(join(setup.repo, file.path))), mode: statSync(join(setup.repo, file.path)).mode & 0o777 })));
    assert.equal(runCount(), setupRuns); assert.equal(nativeCount(), 1); assert.equal(existsSync(networkJournal), false);
    assert.equal(existsSync(join(setup.repo, 'node_modules')), false); assert.equal(existsSync(join(setup.repo, 'package.json')), false);
    const cleanup = installations.map(installation => {
      assert.equal(spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: installation.repo }).status, 128);
      assert.equal(execFileSync('git', ['ls-files', '--stage'], { cwd: installation.repo, encoding: 'utf8' }), '', 'Delivery bookkeeping must not stage files');
      const generations = new RuntimeGenerations(installation.registry);
      try { const state = generations.state(); assert.deepEqual(state.readers, []); assert.equal(state.maintenance, null); return { registry: installation.registry, readers: 0, maintenance: null }; }
      finally { generations.close(); }
    });
    const receipt = { status: 'passed', version: manifest.version, archive: { path: archivePath, digest: digest(readFileSync(archivePath)) }, launcher: { path: cli, digest: digest(readFileSync(cli)) },
      evidence_directory: temporary, first_source: { empty: 'ready', uncovered: 'refused', declared_project_owner: 'ready' },
      progress: { check_run: batch.run_id, original_result: originalPath, original_result_digest: digest(originalBytes), task_id: evidence.task_id, task_revision: evidence.task_revision,
        native_dispatches: nativeCount(), auto_update: 'updated-once', repeats: 'unchanged', stale_request: 'refused', wrong_batch: 'refused-before-dispatch', wrong_run: 'refused', wrong_spec_reference: 'refused-without-dispatch', source_drift: 'refused', narrative_and_mode: 'preserved' },
      specification: { normal_documentation_gate: 'passed', wrong_reference: 'failed', source_drift: 'failed', correction: 'passed', semantic_acceptance: 'not-established' },
      lint_setup: { dry_run: 'passive', stale_digest: 'refused', apply: 'installed', repeat: 'unchanged', acquisition: 'not-performed', checks: 'not-performed' },
      model: { fixed_config: 'unchanged', model: 'fixture-fixed-model', effort: 'high', inference_fetches: 0 }, cleanup, dispatches,
      limits: ['Disposable synthetic repositories and caller-declared task context', 'Project-owned captured fixture check is not a qualified Kotlin linter', 'Setup proves deterministic file installation, not Ruff execution or tool acquisition', 'No real provider, JEV, semantic acceptance, desktop hook delivery or adopter proof', 'Exact development archive identity retained; final release qualification is separate'] };
    writeFileSync(join(temporary, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n'); return receipt;
  } catch (error) { failure = error; error.proofDirectory = temporary; throw error; }
  finally {
    writeFileSync(join(temporary, 'public-dispatches.json'), JSON.stringify(dispatches, null, 2) + '\n');
    if (failure) console.error(`Major delivery failure evidence retained: ${temporary}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  console.log(JSON.stringify(await verifyMajorDelivery(process.argv[2] ?? process.cwd(), process.argv[3])));
