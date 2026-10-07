import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { closeSync, constants, fstatSync, globSync, lstatSync, openSync, readFileSync, readdirSync, readSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_CAPTURE_MAX_BYTES } from '../src/source-capture-limits.ts';
import { commandEnvironment } from '../src/process-owner.ts';

export const SPEC_PATH = 'docs/specs/engine-4-1-context-quality.md';
export const PLAN_PATH = 'docs/exec-plans/active/2026-10-05-4-1-context-quality.md';
export const PACK_ID = 'source-4-1';
const engine = names => names.trim().split(/\s+/u).map(name => `components/engine/test/${name}.test.ts`);
const scripts = names => names.trim().split(/\s+/u).map(name => `components/engine/scripts/${name}.test.mjs`);
const TESTS = {
  F0: [...engine('delivery-notes specification-contract planning command-argv'), ...scripts('check-4-1-source')],
  F1: engine('task-facts workflow-facts decision-task-binding prompt-context prompt-task-binding context-task-switch context-workspace-identity plan-progress plan-history check-status runtime-command-classification'),
  F2: [...engine('context-excerpts context-projection context-metadata context-route-passage context-passage-advice context-packet context-negative-passage context-evaluation-quality context-quality context-parallel'), ...scripts('verify-context-quality verify-bound-continuation')],
  F3: engine('context-observations decision-episodes decision-outcomes provider-telemetry release-evaluation release-evaluation-capture runtime-command-classification'),
  F4: engine('default-validation-owners context-budget-readiness context-router context-route-presentation context-entry-recovery prompt-task-binding provider-context context-rc10 context-family junit-evidence builtin-checks check-execution context-doctor runtime-doctor runtime-staging runtime-operation-completion decision-doctor decision-configuration prompt-context prompt-fallback-retention context-task-switch startup-hook-output'),
};
const HARNESSTESTS = ['store', 'continuity', 'cli', 'plan-reference'].map(name => `test/${name}.test.ts`);

/** Keep the configured no-emit typecheck while avoiding npm's unqualifiable .bin symlink aliases. */
export function sourceBatchCommands(root, batch) {
  if (!/^F[0-5]$/u.test(batch)) throw new Error('Unknown 4.1 source batch');
  const commands = batch === 'F5'
    ? [{ cwd: root, argv: [process.execPath, '--test', '--test-concurrency=2', 'components/engine/test/**/*.test.ts'] },
       { cwd: join(root, 'components/harness'), argv: [process.execPath, '--experimental-strip-types', '--test', 'test/**/*.test.ts'] },
       { cwd: root, argv: [process.execPath, '--test', ...scripts('verify-context-quality verify-bound-continuation verify-major-delivery verify-conversational-facts verify-continuity-upgrade verify-installed-lint check-4-1-source')] }]
    : [{ cwd: root, argv: [process.execPath, '--test', ...TESTS[batch]] }];
  if (batch === 'F1') commands.push({ cwd: join(root, 'components/harness'), argv: [process.execPath, '--experimental-strip-types', '--test', ...HARNESSTESTS] });
  commands.push({ cwd: root, argv: [process.execPath, join(root, 'node_modules/typescript/bin/tsc'), '--noEmit'] });
  if (batch === 'F1' || batch === 'F5') commands.push({ cwd: join(root, 'components/harness'), argv: [process.execPath, join(root, 'components/harness/node_modules/typescript/bin/tsc'), '--noEmit'] });
  return commands;
}

export const INPUT_CLOSURE = {
  trees: ['components/engine/src', 'components/engine/test', 'components/engine/scripts', 'components/harness/src',
    'components/harness/test', 'components/harness/docs', 'src/project_governance_runtime', 'docs', 'config', 'tools',
    'node_modules', 'components/harness/node_modules'],
  files: ['package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.build.json', 'components/harness/package.json',
    'components/harness/package-lock.json', 'components/harness/tsconfig.json', 'AGENTS.md', 'CHARTER.md', 'README.md', 'LICENSE'],
};

function safePath(root, path) {
  if (isAbsolute(path) || !path || path.split('/').some(part => !part || part === '.' || part === '..') || /[\\\0]/u.test(path)) throw new Error('Unsafe source input path');
  const full = join(root, path), resolved = realpathSync(full), child = relative(root, resolved);
  if (child === '..' || child.startsWith('../') || isAbsolute(child)) throw new Error(`Source input escaped workspace: ${path}`);
  return full;
}
function hashFile(root, path) {
  const full = safePath(root, path), fd = openSync(full, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.size > BigInt(SOURCE_CAPTURE_MAX_BYTES)) throw new Error(`Source input exceeds the existing original-reader contract: ${path}`);
    const hash = createHash('sha256'), buffer = Buffer.alloc(65536);
    let total = 0;
    for (;;) {
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (!count) break;
      hash.update(buffer.subarray(0, count)); total += count;
      if (BigInt(total) > before.size) throw new Error(`Source input changed while reading: ${path}`);
    }
    const after = fstatSync(fd, { bigint: true }), current = lstatSync(full, { bigint: true });
    if (BigInt(total) !== before.size || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs ||
      current.isSymbolicLink() || current.dev !== after.dev || current.ino !== after.ino)
      throw new Error(`Source input changed while reading: ${path}`);
    return { file: { path, sha256: hash.digest('hex') }, identity: identity(after) };
  } finally { closeSync(fd); }
}
const identity = stat => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(value => String(value));

/** Tool binaries live outside the workspace manifest. Stream their complete bytes without a source-file size cap. */
export function snapshotNodeToolchain(executable = process.execPath) {
  const full = realpathSync(executable), fd = openSync(full, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile()) throw new Error('Node executable must be an ordinary file');
    const hash = createHash('sha256'), buffer = Buffer.alloc(65536);
    let total = 0n;
    for (;;) {
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (!count) break;
      hash.update(buffer.subarray(0, count)); total += BigInt(count);
      if (total > before.size) throw new Error('Node executable changed while reading');
    }
    const after = fstatSync(fd, { bigint: true }), current = lstatSync(full, { bigint: true });
    if (total !== before.size || JSON.stringify(identity(before)) !== JSON.stringify(identity(after)) ||
      current.isSymbolicLink() || current.dev !== after.dev || current.ino !== after.ino)
      throw new Error('Node executable changed while reading');
    return { value: { version: 1, node_version: process.version, exec_path: executable, resolved_exec_path: full,
      executable_sha256: hash.digest('hex') }, identity: identity(after) };
  } finally { closeSync(fd); }
}

/** Match the native process owner's credential-free local development environment. */
export function sourceBatchEnvironment() { return commandEnvironment({}); }

/** Enumerate the declared source/dependency closure again after execution; added inputs also invalidate proof. */
function observeSourceInputs(root, closure) {
  root = realpathSync(root);
  const paths = new Set(closure.files), directories = [];
  const visit = path => {
    const full = safePath(root, path), stat = lstatSync(full, { bigint: true });
    if (stat.isSymbolicLink()) throw new Error(`Symlink source input refused: ${path}`);
    if (stat.isFile()) { paths.add(path); return; }
    if (!stat.isDirectory()) throw new Error(`Unsupported source input: ${path}`);
    directories.push({ path, identity: identity(stat) });
    for (const name of readdirSync(full).sort()) {
      // These are generated Python caches and unused npm command aliases, never source inputs here.
      if (name === '__pycache__' || name === '.bin' && path.includes('node_modules')) continue;
      visit(`${path}/${name}`);
    }
  };
  for (const path of closure.trees) visit(path);
  if (!paths.size || paths.size > 65536) throw new Error('Source closure exceeds the existing native manifest contract');
  const captured = [...paths].sort().map(path => hashFile(root, path));
  return { files: captured.map(row => row.file), identities: captured.map(row => row.identity), directories };
}
export function snapshotSourceInputs(root, closure = INPUT_CLOSURE) {
  return observeSourceInputs(root, closure).files;
}

export async function inspectSourceContracts(root) {
  const { parseImplementationPlan, implementationPlanFindings } = await import('../src/implementation-plan.ts');
  const { parseSpecificationDeclaration } = await import('../src/specification-contract.ts');
  const { ValidationSubject } = await import('../src/change-subject.ts');
  const { loadPacks } = await import('../src/pack-configuration.ts');
  const { buildPlan } = await import('../src/planning.ts');
  const specification = parseSpecificationDeclaration(readFileSync(join(root, SPEC_PATH)));
  const plan = parseImplementationPlan(PLAN_PATH, readFileSync(join(root, PLAN_PATH), 'utf8'));
  const packs = loadPacks(root, join(root, 'src/project_governance_runtime/packs'));
  const subject = new ValidationSubject(root, { kind: 'project-governance-change-packet', version: 1, scope: 'all', mode: 'all', base_ref: null, records: [], subject_digest: null });
  const findings = implementationPlanFindings(subject, PLAN_PATH, packs);
  if (!specification || specification.criteria.length !== 12 || plan.declaration.batches.map(batch => batch.id).join(',') !== 'F0,F1,F2,F3,F4,F5') throw new Error('4.1 contract requires all twelve criteria and stable F0–F5 batches');
  for (const batch of plan.declaration.batches) {
    const verification = batch.items.find(item => item.kind === 'verification');
    if (batch.items.map(item => item.id).join(',') !== `${batch.id}.I,${batch.id}.V,${batch.id}.C` ||
      verification?.check?.stage !== `4-1-${batch.id}` || verification.check.packs.join(',') !== PACK_ID)
      throw new Error(`Exact I/V/C source proof mapping required: ${batch.id}`);
    const selected = buildPlan(packs, { stage: `4-1-${batch.id}`, mode: 'impacted', changedPaths: [], explicitPackIds: [PACK_ID] });
    if (selected.status !== 'ready' || selected.execution_order.join(',') !== PACK_ID) throw new Error(`Source proof mapping unavailable: ${batch.id}`);
    for (const command of sourceBatchCommands(root, batch.id)) for (const path of command.argv.filter(value => /\.test\.(?:ts|mjs)$/u.test(value)))
      if (!globSync(path, { cwd: command.cwd }).length) throw new Error(`Declared source test unavailable: ${path}`);
  }
  if (findings.length) throw new Error(`4.1 specification/plan mapping invalid: ${JSON.stringify(findings)}`);
  return { criteria: 12, batches: 6, pack: PACK_ID };
}

/** One adapter around existing native commands. Stdout is the normal checker envelope; native logs stay on stderr. */
export async function runSourceBatch(root, batch, options = {}) {
  const commands = sourceBatchCommands(root, batch), closure = options.closure ?? INPUT_CLOSURE;
  const before = observeSourceInputs(root, closure), observeToolchain = options.observeToolchain ?? snapshotNodeToolchain;
  const toolchainBefore = observeToolchain(), results = [];
  if (!options.run) {
    for (const directory of [root, ...(batch === 'F1' || batch === 'F5' ? [join(root, 'components/harness')] : [])]) {
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
      if (manifest.scripts?.typecheck !== 'tsc --noEmit') throw new Error('Source typecheck script changed; settle the native command mapping');
    }
    if (batch === 'F5') {
      const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
      const harness = JSON.parse(readFileSync(join(root, 'components/harness/package.json'), 'utf8'));
      if (manifest.scripts?.['test:engine'] !== "node --test --test-concurrency=2 'components/engine/test/**/*.test.ts'" ||
        manifest.scripts?.['test:continuity'] !== 'npm --prefix components/harness test' ||
        harness.scripts?.test !== 'node --experimental-strip-types --test "test/**/*.test.ts"')
        throw new Error('Source test scripts changed; settle the native command mapping');
    }
    if (batch === 'F0') await inspectSourceContracts(root);
  }
  for (const command of commands) {
    const result = (options.run ?? spawnSync)(command.argv[0], command.argv.slice(1), { cwd: command.cwd, encoding: 'utf8', env: sourceBatchEnvironment(), maxBuffer: 16 * 1024 * 1024 });
    if (options.log !== false) process.stderr.write(`${result.stdout ?? ''}${result.stderr ?? ''}`);
    results.push({ argv: command.argv, cwd: command.cwd, exit_code: result.status, signal: result.signal ?? null, ...(result.error ? { error: String(result.error.message) } : {}) });
    if (result.status !== 0 || result.error || result.signal) break;
  }
  const after = observeSourceInputs(root, closure);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Source or dependency inputs changed during verification; original results remain unqualified');
  if (JSON.stringify(toolchainBefore) !== JSON.stringify(observeToolchain())) throw new Error('Node toolchain inputs changed during verification; original results remain unqualified');
  const failed = results.some(result => result.exit_code !== 0 || result.signal || result.error);
  return { status: failed ? 'failed' : 'passed', findings: failed ? [{ rule_id: 'source-4-1.native-command', severity: 'blocking', message: 'Declared native source command failed; inspect original command logs.' }] : [],
    input_manifest: { version: 1, status: 'complete', files: before.files }, evidence: { batch, commands: results, toolchain: toolchainBefore.value,
      toolchain_freshness: 'Qualified during this command. Native plan proof retains workspace-file freshness; later toolchain freshness is separate.',
      limits: 'Source checks only. Installed archive execution, semantic quality, main-model use and product acceptance remain separate.' } };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  try {
    if (args.length !== 2 || args[0] !== '--batch') throw new Error('Use --batch F0|F1|F2|F3|F4|F5');
    const result = await runSourceBatch(realpathSync(process.cwd()), args[1]);
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = result.status === 'passed' ? 0 : 1;
  } catch (error) {
    process.stdout.write(JSON.stringify({ status: 'failed', findings: [{ rule_id: 'source-4-1.input-unqualified', severity: 'blocking', message: error.message }] }) + '\n');
    process.exitCode = 2;
  }
}
