import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { sourceBatchCommands, snapshotSourceInputs, snapshotNodeToolchain, sourceBatchEnvironment, runSourceBatch } from './check-4-1-source.mjs';

const closure = { trees: ['src'], files: ['package.json'] };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'source-4-1-'));
  mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src/owner.ts'), 'original\n');
  writeFileSync(join(root, 'package.json'), '{}\n');
  const executable = join(root, 'fixture-node'); writeFileSync(executable, 'toolchain\n');
  return { root, executable, options: { closure, log: false, observeToolchain: () => snapshotNodeToolchain(executable) },
    cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('source batch mappings retain native frameworks and make broad proof explicit', () => {
  const f1 = sourceBatchCommands('/fixture', 'F1'), f5 = sourceBatchCommands('/fixture', 'F5');
  assert.ok(f1[0].argv.includes('components/engine/test/task-facts.test.ts'));
  assert.ok(f1.some(command => command.argv.includes('test/plan-reference.test.ts')));
  for (const commands of [f1, f5]) assert.ok(commands.find(command => command.cwd.endsWith('/components/harness')).argv.includes('--experimental-strip-types'));
  assert.ok(sourceBatchCommands('/fixture', 'F3')[0].argv.includes('components/engine/test/release-evaluation-capture.test.ts'));
  for (const owner of ['context-entry-recovery', 'prompt-fallback-retention', 'junit-evidence', 'check-execution'])
    assert.ok(sourceBatchCommands('/fixture', 'F4')[0].argv.includes(`components/engine/test/${owner}.test.ts`));
  assert.ok(f5.some(command => command.argv.includes('components/engine/scripts/verify-conversational-facts.test.mjs')));
  assert.ok(f5.some(command => command.argv.includes('components/engine/scripts/check-4-1-source.test.mjs')));
  assert.equal(f1.some(command => command.argv.some(value => value.includes('**'))), false);
  assert.ok(f5[0].argv.includes('components/engine/test/**/*.test.ts'));
  assert.throws(() => sourceBatchCommands('/fixture', 'pre-commit'), /Unknown/);
});

test('stable native completion supplies original hashes and a failed command remains failed', async () => {
  const f = fixture();
  try {
    let calls = 0;
    const passed = await runSourceBatch(f.root, 'F1', { ...f.options, run: () => { calls++; return { status: 0, stdout: 'native result', stderr: '' }; } });
    assert.equal(passed.status, 'passed'); assert.equal(calls, sourceBatchCommands(f.root, 'F1').length);
    assert.deepEqual(passed.input_manifest.files, [
      { path: 'package.json', sha256: createHash('sha256').update('{}\n').digest('hex') },
      { path: 'src/owner.ts', sha256: createHash('sha256').update('original\n').digest('hex') },
    ]);
    assert.deepEqual(passed.evidence.toolchain, { version: 1, node_version: process.version, exec_path: f.executable,
      resolved_exec_path: realpathSync(f.executable), executable_sha256: createHash('sha256').update('toolchain\n').digest('hex') });
    const failed = await runSourceBatch(f.root, 'F1', { ...f.options, run: () => ({ status: 1 }) });
    assert.equal(failed.status, 'failed'); assert.equal(failed.evidence.commands.length, 1);
    assert.equal(failed.input_manifest.status, 'complete');
  } finally { f.cleanup(); }
});

test('changed and newly added inputs refuse qualification despite a successful native command', async () => {
  for (const edit of ['change', 'add']) {
    const f = fixture();
    try {
      await assert.rejects(runSourceBatch(f.root, 'F1', { ...f.options, run: () => {
        writeFileSync(join(f.root, edit === 'change' ? 'src/owner.ts' : 'src/new-dependency.ts'), 'changed\n');
        return { status: 0 };
      } }), /inputs changed during verification/);
    } finally { f.cleanup(); }
  }
});

test('source input aliases cannot escape or masquerade as exact regular-file proof', () => {
  const f = fixture();
  try {
    symlinkSync('owner.ts', join(f.root, 'src/alias.ts'));
    assert.throws(() => snapshotSourceInputs(f.root, closure), /Symlink source input refused/);
  } finally { f.cleanup(); }
});

test('a changed-and-restored file cannot certify the intermediate test candidate', async () => {
  const f = fixture();
  try {
    await assert.rejects(runSourceBatch(f.root, 'F1', { ...f.options, run: () => {
      writeFileSync(join(f.root, 'src/owner.ts'), 'intermediate candidate\n');
      writeFileSync(join(f.root, 'src/owner.ts'), 'original\n');
      return { status: 0 };
    } }), /inputs changed during verification/);
  } finally { f.cleanup(); }
});

test('native toolchain changes and restored bytes cannot certify source completion', async () => {
  for (const restore of [false, true]) {
    const f = fixture();
    try {
      await assert.rejects(runSourceBatch(f.root, 'F1', { ...f.options, run: () => {
        writeFileSync(f.executable, 'replacement node\n');
        if (restore) writeFileSync(f.executable, 'toolchain\n');
        return { status: 0 };
      } }), /Node toolchain inputs changed during verification/);
    } finally { f.cleanup(); }
  }
});

test('toolchain identity streams the complete executable beyond the source-reader allowance', () => {
  const f = fixture();
  try {
    const bytes = Buffer.alloc(17 * 1024 * 1024, 0x61); writeFileSync(f.executable, bytes);
    assert.equal(snapshotNodeToolchain(f.executable).value.executable_sha256, createHash('sha256').update(bytes).digest('hex'));
  } finally { f.cleanup(); }
});

test('source tests receive the native credential-free environment', async () => {
  const f = fixture(), names = ['JEV_TOKEN', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'];
  const originals = new Map(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) process.env[name] = 'synthetic-private-test-value';
    const environment = sourceBatchEnvironment();
    for (const name of names) assert.equal(Object.hasOwn(environment, name), false);
    await runSourceBatch(f.root, 'F1', { ...f.options, run: (_executable, _args, options) => {
      for (const name of names) assert.equal(Object.hasOwn(options.env, name), false);
      assert.equal(options.env.PATH, process.env.PATH);
      return { status: 0 };
    } });
  } finally {
    for (const [name, value] of originals) if (value === undefined) delete process.env[name]; else process.env[name] = value;
    f.cleanup();
  }
});
