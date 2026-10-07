import { verifyDecisionExperiments } from "./verify-decision-experiments.mjs";
import { verifyRc6Prompt } from "./verify-rc6-prompt.mjs";
import { verifyPythonParser } from "./verify-python-parser.mjs";
import { verifyGreenfield } from "./verify-greenfield.mjs";
import { verifyBatchReview } from "./verify-batch-review.mjs";
import { verifyMajorDelivery } from "./verify-major-delivery.mjs";
import { verifyInstalledLint } from "./verify-installed-lint.mjs";
import { verifyEvaluationProducers } from "../test/fixtures/release-evaluation-producers.mjs";
import { verifyCheckRecovery } from "./verify-check-recovery.mjs";
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { verifyDecisionPilot } from "./verify-decision-pilot.mjs";
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// Runtime dependencies are bundled; backend qualification uses the caller's explicit pinned tools.
const archive = resolve(process.argv[2] || '');
if (!archive.endsWith('.tgz')) throw new Error('Expected compiled package archive');
const toolArgument = process.argv[3];
if (!toolArgument) throw new Error('Expected explicit lint toolRoot at argv[3], or --lint-tools-unavailable for an unqualified result');
const lintToolRoot = toolArgument === '--lint-tools-unavailable' ? null : resolve(toolArgument);
const root = mkdtempSync(join(tmpdir(), 'governance-release-proof-'));
try {
  execFileSync('npm', ['install', '--prefix', root, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', archive], { stdio: 'pipe', timeout: 60000 });
  const pkg = join(root, 'node_modules/@organta/project-governance');
  const manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
  if (manifest.name !== '@organta/project-governance') throw new Error('Unexpected product identity');
  // Staging below validates the exact version, archive identity and canonical runtime lock.
  const output = execFileSync(process.execPath, [join(pkg, 'dist/engine/src/cli.js'), '--help'], { cwd: root, encoding: 'utf8', timeout: 10000 });
  if (!output.includes('workflow-wait') || !output.includes('context-packet')) throw new Error('Installed command surface missing');
  for (const [command, marker] of [['provider-help','provider-submit'], ['startup-help','startup']]) {
    const guide = execFileSync(process.execPath, [join(pkg, 'dist/engine/src/cli.js'), command], { cwd: root, encoding: 'utf8', timeout: 10000 });
    if (!guide.includes(marker)) throw new Error('Installed guide missing: ' + command);
  }
  const host = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import * as host from '@organta/project-governance/host/v1';
    assert.equal(host.HOST_API_VERSION, 1);
    for (const name of ['Store','proposeAction','authorizeAction','defaultPolicy','WorkflowStore','resolveWorkflowRecipe','recipeDigest','digest','fileDigest','ResourceRegistry','resourceRegistryPath']) assert.equal(typeof host[name], 'function', name);
    const store = new host.Store(':memory:');
    assert.ok(store.createTask('installed host API', []).taskId);
    store.close();
    console.log('passed');
  `], { cwd: root, encoding: 'utf8', timeout: 10000 });
  if (host.trim() !== 'passed') throw new Error('Installed host API missing');
  if (!readFileSync(join(pkg, manifest.exports['./host/v1'].types), 'utf8').includes('HOST_API_VERSION')) throw new Error('Host API declarations missing');
  const pythonParser = await verifyPythonParser(pkg, root);
  const beforeStaging = readFileSync(join(pkg, "package.json"));
  const staging = await verifyExplicitStaging(pkg, archive, manifest, root);
  assert.deepEqual(readFileSync(join(pkg, "package.json")), beforeStaging, "Staging must preserve the installed parent package");
  const pilot = await verifyDecisionPilot(pkg, { generationDirectory: staging.generationDirectory });
  const experiments = await verifyDecisionExperiments(pkg);
  const prompt = await verifyRc6Prompt(pkg, archive);
  const greenfield = await verifyGreenfield(pkg, archive);
  const batchReview = await verifyBatchReview(pkg, archive);
  const majorDelivery = await verifyMajorDelivery(pkg, archive);
  const installedLint = lintToolRoot ? await verifyInstalledLint(pkg, archive, lintToolRoot)
    : { status: 'unqualified', reason: 'qualified-backend-tools-explicitly-unavailable', execution: 'not-performed' };
  const receipt = { status: installedLint.status === 'passed' ? 'passed' : 'unqualified', evidence_directory: root,
    staging, prompt, greenfield, batchReview, majorDelivery, installedLint, pythonParser, decisionPilot: pilot, experiments,
    hostApi: 'passed', version: manifest.version, installedCommand: 'passed',
    scope: 'offline installation and inactive staging, original evaluation producers, installed greenfield first-task, deterministic delivery/lint setup, explicit real-backend qualification and batch-before-review preparation proof, compiled Python source/comment analysis, public host API and decision consumers with fixture inference; not full semantic qualification, accepted ordinary tasks or release provenance; no live device or benefit claim' };
  writeFileSync(join(root, 'archive-proof-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
  if (receipt.status !== 'passed') process.exitCode = 2;
} catch (error) {
  writeFileSync(join(root, 'archive-proof-failure.json'), JSON.stringify({ status: 'failed', message: error.message,
    proofDirectory: error.proofDirectory ?? root, stack: error.stack }, null, 2) + '\n');
  throw error;
} finally { console.error(`Archive proof evidence retained: ${root}`); }


/** Synthetic source identity tests staging mechanics; never emit this lock as release provenance. */
async function verifyExplicitStaging(pkg, archive, manifest, root) {
  const { stageRuntimeArchive } = await import(pathToFileURL(join(pkg, 'dist/engine/src/runtime-staging.js')).href);
  const lock = { schema_version: 2, package: manifest.name, version: manifest.version,
    artifact: { url: pathToFileURL(archive).href, integrity: 'sha512-' + createHash('sha512').update(readFileSync(archive)).digest('base64') },
    source_commit: 'a'.repeat(40), node: manifest.engines.node, configuration_schema: 1 };
  const result = stageRuntimeArchive(archive, lock, join(root, 'inactive-stages'));
  assert.equal(result.state, 'staged'); assert.equal(result.activation, 'not-performed');
  assert.equal(result.lock.version, manifest.version);
  assert.throws(() => stageRuntimeArchive(archive, { ...lock, version: '3.0.0-rc.999999' }, join(root, 'mismatch')), error => /identity differs from lock/.test(error.cause?.message ?? ''));
  assert.throws(() => stageRuntimeArchive(archive, { ...lock, artifact: { ...lock.artifact, integrity: 'sha512-' + Buffer.alloc(64).toString('base64') } }, join(root, 'bad-hash')), /integrity mismatch/);
  const evaluationProducers = await verifyEvaluationProducers(result.directory, root);
  const checkRecovery = await verifyCheckRecovery(pkg, result.directory, lock, root);
  return { status: 'passed', generationDirectory: result.directory, activation: 'isolated recovery and evaluator fixtures only', checkRecovery, evaluationProducers, sourceIdentity: 'synthetic fixture only; not release provenance' };
}
