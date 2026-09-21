import { verifyDecisionConcurrency } from "./verify-decision-concurrency.mjs";
import { verifyDecisionObservers } from "./verify-decision-observers.mjs";
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Compiled public-command proof with fake inference and real native check execution. */
export async function verifyDecisionPilot(packageRoot) {
  const cli = join(resolve(packageRoot), 'dist/engine/src/cli.js');
  assert.ok(existsSync(cli), 'Build or install the package before running pilot proof');
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'governance-decision-pilot-')));
  const repo = join(temporary, 'repo'), state = join(temporary, 'state');
  mkdirSync(repo); mkdirSync(join(repo, 'config/governance'), { recursive: true });
  mkdirSync(join(repo, 'config/validation/packs'), { recursive: true }); mkdirSync(join(repo, 'src'));
  const write = (path, value) => writeFileSync(join(repo, path), JSON.stringify(value));
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  const preload = join(temporary, 'provider-fixture.mjs'), callsPath = join(temporary, 'provider-calls.jsonl');
  writeFileSync(preload, `import {appendFileSync} from 'node:fs';
    globalThis.fetch = async (url,init) => {
      if(url !== 'https://api.typesafe.ai/v1/systemone') throw Error('Unexpected network');
      const payload=JSON.parse(init.body); appendFileSync(${JSON.stringify(callsPath)},JSON.stringify(payload)+'\\n');
      return Response.json({model:'jev-1.13.0',usage:{input_tokens:100,output_tokens:10},answers:Object.fromEntries(Object.entries(payload.questions).map(([id,q])=>{
        if(q.type==='noul') return [id,{type:'noul',noul:payload.state.consumers.includes('DL13')?0.1:0.9}];
        const keys=Object.keys(q.criteria),choice=payload.state.consumers.includes('DL09')?(id==='scope'?'broader-than-evidence':'insufficient'):keys.find(key=>key!=='unknown');
        return [id,{type:'choice',choice,confidence:0.9,probabilities:Object.fromEntries(keys.map(key=>[key,key===choice?1:0]))}];
      }))});
    };`);
  const environment = { ...process.env, XDG_STATE_HOME: state, JEV_TOKEN: 'fixture-only' };
  for (const key of Object.keys(environment)) if (key.startsWith('GOVERNANCE_GENERATION_')) delete environment[key];
  const run = (args, expectedStatus = 0) => {
    const result = spawnSync(process.execPath, ['--import', preload, cli, ...args], { cwd: repo, env: environment, encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
    assert.equal(result.status, expectedStatus, result.stderr || result.error?.message);
    return JSON.parse(result.stdout.trim());
  };
  let finished = false;
  try {
    git('init'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'fixture');
    write('config/governance/profile.yaml', { continuity: { decisions: { mode: 'auto', allowed_data_classes: ['source'], allowed_source_paths: ['**'],
      consumers: { DL01: { mode: 'auto' }, DL02: { mode: 'auto' }, DL07: { mode: 'auto' } } } } });
    write('config/governance/review-rules.json', { version: 1, rules: [{ id: 'explicit-expectation', title: 'Do not weaken expectations', rationale: 'Tests should detect incorrect results', examples: [] }] });
    const command = { run: [process.execPath, '-e', "console.log(JSON.stringify({status:'passed',findings:[]}))"] };
    write('config/validation/packs/pilot.yaml', { id: 'pilot', enforcement: 'blocking', stages: ['pilot-check', 'pilot-push'], path_globs: ['src/**'], commands: [command] });
    write('config/validation/packs/optional.yaml', { id: 'optional', enforcement: 'advisory', stages: ['pilot-check', 'pilot-push'], path_globs: ['other/**'], commands: [command] });
    writeFileSync(join(repo, 'src/example.test.ts'), 'assert.equal(actual, expected);\n');
    git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Capture fixture');
    writeFileSync(join(repo, 'src/example.test.ts'), 'assert.ok(true);\n');
    const common = ['--stage', 'pilot-check', '--base-ref', 'HEAD', '--decision-task', 'pilot-task', '--decision-revision', '1', '--decision-purpose', 'Fix the regression without weakening tests'];
    const plan = run(['plan', ...common]);
    assert.deepEqual(plan.selected_packs, ['pilot']); assert.deepEqual(plan.execution_order, ['pilot']);
    assert.equal(plan.decisionAdvice.validation.delivered, true);
    assert.deepEqual(plan.decisionAdvice.validation.recommendedOptionalChecks.map(item => item.packId), ['optional']);
    const nextStage = run(['plan', ...common.map(value => value === 'pilot-check' ? 'pilot-push' : value)]);
    assert.equal(nextStage.decisionAdvice.validation.delivered, true, JSON.stringify(nextStage.decisionAdvice));
    assert.notEqual(nextStage.decisionAdvice.validation.decision.receiptId, plan.decisionAdvice.validation.decision.receiptId);
    const checked = run(['check', ...common, '--review-rules', 'config/governance/review-rules.json']);
    assert.equal(checked.status, 'passed');
    assert.equal(checked.decisionAdvice.review.batched, true);
    for (const id of ['DL01', 'DL02']) {
      const advice = checked.decisionAdvice.review.consumers.find(item => item.consumerId === id);
      assert.equal(advice.delivered, true, JSON.stringify(advice)); assert.ok(advice.findings.length > 0, id);
    }
    const native = JSON.parse(readFileSync(join(state, 'project-governance/check-runs', checked.run_id, 'result.json'), 'utf8'));
    assert.equal(native.status, 'passed'); assert.equal(native.decisionAdvice, undefined);
    assert.deepEqual(native.results, checked.results);
    const callerPath = join(temporary, 'check-caller.json'); writeFileSync(callerPath, JSON.stringify(checked));
    const hashFile = path => `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
    const metricsPath = join(state, 'project-governance/check-runs', checked.run_id, 'metrics.json');
    const manifestPath = join(temporary, 'outcomes.json');
    writeFileSync(manifestPath, JSON.stringify({ version: 1, episodes: [{ id: 'fixture',
      decisions: checked.decisionAdvice.review.decisions.map(item => item.receiptId),
      caller: { path: callerPath, digest: hashFile(callerPath) },
      native: [{ kind: 'check', path: metricsPath, digest: hashFile(metricsPath) }],
      labels: [{ reviewer: 'fixture', disposition: 'useful', at: '2026-09-21T12:00:00Z' }] }] }));
    const joined = run(['telemetry', 'decisions', '--outcomes-manifest', manifestPath]);
    assert.equal(joined.outcome_report.counts.joined, 1, JSON.stringify(joined.outcome_report));
    assert.equal(joined.outcome_report.samples[0].native[0].state, 'passed');
    assert.equal(joined.outcome_report.samples[0].observations.llmInputTokens, null);
    const report = run(['telemetry', 'decisions']);
    assert.equal(report.pilot.consumers.DL01.observations, 1);
    assert.equal(report.pilot.consumers.DL02.observations, 1);
    const calls = readFileSync(callsPath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(calls.filter(call => call.state.consumers.includes('DL01')).length, 1);
    write('config/governance/profile.yaml', { continuity: { decisions: { mode: 'auto', allowed_data_classes: ['source'], allowed_source_paths: ['**'],
      consumers: { DL01: { mode: 'shadow' }, DL02: { mode: 'off' }, DL07: { mode: 'off' } } } } });
    git('add', 'config/governance/profile.yaml'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Freeze independent feature modes');
    const mixed = run(['check', ...common.map(value => value === '1' ? '2' : value)]);
    assert.equal(mixed.status, 'passed'); assert.equal(mixed.decisionAdvice.review.batched, false);
    assert.equal(mixed.decisionAdvice.review.consumers.find(item => item.consumerId === 'DL01').mode, 'shadow');
    assert.equal(mixed.decisionAdvice.review.consumers.find(item => item.consumerId === 'DL01').delivered, false);
    assert.equal(mixed.decisionAdvice.review.consumers.find(item => item.consumerId === 'DL02').mode, 'off');
    delete environment.JEV_TOKEN;
    const beforeMissingToken = readFileSync(callsPath, 'utf8');
    const noToken = run(['check', ...common.map(value => value === '1' ? '3' : value)]);
    assert.equal(noToken.status, 'passed');
    assert.equal(noToken.decisionAdvice.review.consumers.find(item => item.consumerId === 'DL01').reason, 'missing-token');
    assert.equal(readFileSync(callsPath, 'utf8'), beforeMissingToken);
    environment.JEV_TOKEN = "fixture-only";
    await verifyDecisionConcurrency({ repo, cli, preload, environment, common, callsPath, run, git });
    const observers = await verifyDecisionObservers({ packageRoot, repo, temporary, run, write, git, environment, callsPath });
    finished = true;
    return { status: 'passed', consumers: ['DL01', 'DL02', 'DL07', ...observers].sort(), native_checks: 'passed', native_check_authority_unchanged: true, provider: 'fixture' };
  } finally {
    await cleanupPilot(packageRoot, temporary, state, finished);
  }
}
async function cleanupPilot(packageRoot, temporary, state, finished) {
    // Verify recorded native writers have exited before deleting their evidence.
    const { processFingerprint } = await import(pathToFileURL(join(resolve(packageRoot), 'dist/engine/src/process-owner.js')).href);
    const owners = [];
    const walk = directory => { if (!existsSync(directory)) return; for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (['owner.json', 'guardian.json'].includes(entry.name)) { try { owners.push(JSON.parse(readFileSync(path, 'utf8'))); } catch {} }
    } };
    walk(state);
    const active = () => owners.some(owner => Number.isInteger(owner.pid) && owner.fingerprint && processFingerprint(owner.pid) === owner.fingerprint);
    const deadline = Date.now() + 5000;
    while (active() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    if (active() || !finished) console.error(`Pilot evidence retained: ${temporary}`);
    else rmSync(temporary, { recursive: true, force: true });
    assert.equal(active(), false, 'Native writers must stop before proof cleanup');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await verifyDecisionPilot(process.argv[2] ?? process.cwd())));
}
