import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import { continuationCandidate, continuationInputs } from './verify-continuity-upgrade.mjs';
import { verifyRuntimeArchive } from '../src/runtime-artifact.ts';
import { compiledRuntimeLock } from '../src/runtime-lock.ts';

test('explicit continuation inputs retain exact old/4.0.0 archives and original locks without relabeling', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'continuity-explicit-input-test-'));
  try {
    const payload = (name, version, marker) => {
      const root = join(temporary, name), archive = join(temporary, `${name}.tgz`); mkdirSync(root);
      const manifest = { name: '@organta/project-governance', version, engines: { node: '>=24.16.0 <25' } };
      const bytes = Buffer.from(`archive-bytes-only-${marker}`); writeFileSync(join(root, 'package.json'), JSON.stringify(manifest)); writeFileSync(archive, bytes);
      const lock = { schema_version: 2, package: manifest.name, version, node: manifest.engines.node, configuration_schema: 1,
        source_commit: marker.repeat(40), artifact: { url: `https://example.invalid/releases/${version}.tgz`,
          integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') } };
      return { root, archive, bytes, manifestBytes: readFileSync(join(root, 'package.json')), lock };
    };
    const old = payload('published-old', '3.0.0-rc.10.9', 'a'), candidate = payload('actual-candidate', '4.0.0', 'b');
    const lockBytes = JSON.stringify([old.lock, candidate.lock]);
    const result = continuationInputs(candidate.root, candidate.archive, { oldPackageRoot: old.root, oldArchive: old.archive,
      oldLock: old.lock, candidatePackageRoot: candidate.root, candidateArchive: candidate.archive, candidateLock: candidate.lock });
    assert.equal(result.mode, 'explicit-local-archives'); assert.equal(result.old.version, '3.0.0-rc.10.9'); assert.equal(result.candidate.version, '4.0.0');
    assert.equal(result.old.lock, old.lock); assert.equal(result.candidate.lock, candidate.lock);
    assert.equal(compiledRuntimeLock(result.candidate.lock).version, '4.0.0');
    for (const [input, selected] of [[old, result.old], [candidate, result.candidate]]) {
      assert.equal(verifyRuntimeArchive(input.archive, selected.lock).digest, selected.archiveDigest);
      assert.deepEqual(readFileSync(input.archive), input.bytes); assert.deepEqual(readFileSync(join(input.root, 'package.json')), input.manifestBytes);
    }
    assert.equal(JSON.stringify([old.lock, candidate.lock]), lockBytes);
    assert.throws(() => continuationInputs(candidate.root, candidate.archive, { oldArchive: old.archive }), /supplied together/);
    assert.throws(() => continuationInputs(old.root, old.archive, { candidatePackageRoot: old.root, candidateArchive: old.archive }), /distinct old and candidate/);
    const original = readFileSync(candidate.archive); writeFileSync(candidate.archive, Buffer.concat([original, Buffer.from('incorrect bytes')]));
    assert.throws(() => continuationInputs(candidate.root, candidate.archive, { oldPackageRoot: old.root, oldArchive: old.archive, candidateLock: candidate.lock }), /original lock/);
    writeFileSync(candidate.archive, original);
    assert.equal(continuationInputs(candidate.root, candidate.archive, { oldPackageRoot: old.root, oldArchive: old.archive, candidateLock: candidate.lock }).candidate.version, '4.0.0');
    const defaultFixture = continuationInputs(candidate.root, candidate.archive);
    assert.equal(defaultFixture.mode, 'synthetic-generation-separation'); assert.equal(defaultFixture.candidate, null);
    assert.match(defaultFixture.old.sourceIdentity, /synthetic fixture/);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test('the continuation candidate changes only scratch identity, preserves bundled dependencies and never runs package scripts', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'continuity-candidate-test-')), root = join(temporary, 'source');
  try {
    mkdirSync(join(root, 'dist/engine/assets'), { recursive: true }); mkdirSync(join(root, 'node_modules/fixture-dependency'), { recursive: true });
    const manifest = { name: '@organta/project-governance', version: '3.0.0-rc.10.9', files: ['dist'], engines: { node: '>=24.16.0 <25' },
      bin: { 'project-governance': 'dist/engine/src/cli.js' }, dependencies: { 'fixture-dependency': '1.0.0' },
      scripts: { prepack: 'node -e "require(\'node:fs\').writeFileSync(\'prepack-ran\',\'unexpected\')"' } };
    const lock = { name: manifest.name, version: manifest.version, lockfileVersion: 3,
      packages: { '': { name: manifest.name, version: manifest.version, dependencies: manifest.dependencies },
        'node_modules/fixture-dependency': { version: '1.0.0' } } };
    const lockPath = join(root, 'dist/engine/assets/runtime-dependencies.lock.json');
    writeFileSync(join(root, 'package.json'), JSON.stringify(manifest)); writeFileSync(lockPath, JSON.stringify(lock));
    writeFileSync(join(root, 'node_modules/fixture-dependency/package.json'), JSON.stringify({ name: 'fixture-dependency', version: '1.0.0' }));
    const originalManifest = readFileSync(join(root, 'package.json')), originalLock = readFileSync(lockPath);
    const candidate = continuationCandidate(root, temporary);
    const member = path => JSON.parse(execFileSync('tar', ['-xOf', candidate.archive, `package/${path}`], { encoding: 'utf8' }));
    assert.equal(candidate.version, '4.0.0-continuity-fixture.1');
    assert.equal(member('package.json').version, candidate.version);
    const packedLock = member('dist/engine/assets/runtime-dependencies.lock.json');
    assert.equal(packedLock.version, candidate.version); assert.equal(packedLock.packages[''].version, candidate.version);
    assert.deepEqual(packedLock.packages[''].dependencies, manifest.dependencies);
    assert.equal(member('node_modules/fixture-dependency/package.json').version, '1.0.0');
    assert.deepEqual(readFileSync(join(root, 'package.json')), originalManifest); assert.deepEqual(readFileSync(lockPath), originalLock);
    assert.equal(existsSync(join(root, 'prepack-ran')), false); assert.equal(existsSync(join(temporary, 'continuity-candidate/prepack-ran')), false);
    assert.equal(candidate.artifact.integrity, 'sha512-' + createHash('sha512').update(readFileSync(candidate.archive)).digest('base64'));

    const runtimeLock = { schema_version: 2, package: manifest.name, version: candidate.version, artifact: candidate.artifact,
      source_commit: 'b'.repeat(40), node: manifest.engines.node, configuration_schema: 1 };
    const originalArchive = readFileSync(candidate.archive);
    assert.equal(verifyRuntimeArchive(candidate.archive, runtimeLock).packageVersion, candidate.version);
    // The same verification entry must detect the seeded byte fault, then pass after correction.
    writeFileSync(candidate.archive, Buffer.concat([originalArchive, Buffer.from('seeded incorrect archive bytes')]));
    assert.throws(() => verifyRuntimeArchive(candidate.archive, runtimeLock), /Runtime archive integrity mismatch/);
    writeFileSync(candidate.archive, originalArchive);
    assert.equal(verifyRuntimeArchive(candidate.archive, runtimeLock).packageVersion, candidate.version);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test('synthetic native dispatch distinguishes a configured timeout from normal completion', { timeout: 15000 }, async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'continuity-dispatch-test-'));
  const child = spawn(process.execPath, [new URL('./fixtures/continuity-native-host.mjs', import.meta.url).pathname,
    temporary, pathToFileURL(resolve('components/engine/src/startup-host-owner.ts')).href], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const next = async () => JSON.parse((await lines.next()).value);
  try {
    const ready = await next(); assert.equal(ready.status, 0, ready.stderr); assert.equal(ready.captured.pid, child.pid);
    child.stdin.write(JSON.stringify({ command: process.execPath, args: ['-e', 'setTimeout(() => {}, 30000)'], timeoutMs: 50 }) + '\n');
    const timeout = await next();
    assert.equal(timeout.timedOut, true); assert.equal(timeout.errorCode, 'ETIMEDOUT'); assert.equal(timeout.signal, 'SIGTERM');
    assert.equal(timeout.status, null);
    child.stdin.write(JSON.stringify({ command: process.execPath, args: ['-e', 'process.stdout.write("completed")'], timeoutMs: 1000 }) + '\n');
    const completed = await next();
    assert.equal(completed.timedOut, false); assert.equal(completed.status, 0); assert.equal(completed.signal, null);
    assert.equal(completed.stdout, 'completed');
  } finally {
    child.stdin.end(JSON.stringify({ stop: true }) + '\n');
    const result = await exited; assert.equal(result.code, 0);
    rmSync(temporary, { recursive: true, force: true });
  }
});
