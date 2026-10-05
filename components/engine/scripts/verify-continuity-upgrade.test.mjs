import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import { continuationCandidate, continuationInputs, verifyContinuationInstallation } from './verify-continuity-upgrade.mjs';
import { verifyRuntimeArchive } from '../src/runtime-artifact.ts';
import { compiledRuntimeLock } from '../src/runtime-lock.ts';
import { digest } from '../src/core.ts';

function installationFixture(version = '3.0.0-rc.10.9') {
  const directory = mkdtempSync(join(tmpdir(), 'continuity-old-installation-test-'));
  const bytes = Buffer.from(`synthetic retained ${version} archive bytes`);
  const lock = { schema_version: 2, package: '@organta/project-governance', version,
    artifact: { url: `https://example.invalid/releases/${version}.tgz`,
      integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') },
    source_commit: 'a'.repeat(40), node: '>=24.16.0 <25', configuration_schema: 1 };
  const payload = { lock, version: lock.version, archiveDigest: 'sha256:' + createHash('sha256').update(bytes).digest('hex') };
  const installation = { version: 1, state: 'staged', directory,
    executable: join(directory, 'node_modules/@organta/project-governance/dist/engine/src/cli.js'),
    lockDigest: digest(lock), lock, archive: { version: 1, package: lock.package, packageVersion: lock.version,
      integrity: lock.artifact.integrity, bytes: bytes.length, scope: 'archive-bytes-only' },
    dependencies: { fixture: 'synthetic' }, installedTree: { fixture: 'synthetic' }, nodeVersion: '24.16.0', activation: 'not-performed' };
  const receipt = join(directory, 'installation.json'), archive = join(directory, 'runtime.tgz');
  const write = () => writeFileSync(receipt, JSON.stringify(installation));
  write(); writeFileSync(archive, bytes);
  // Only the historical owner's return shape is simulated; the current owner still verifies every byte.
  const legacyInstallerArchive = (path, lock) => {
    const { digest, ...legacy } = verifyRuntimeArchive(path, lock); return legacy;
  };
  const installer = { package: lock.package, version: '3.0.0-rc.10.9', scope: 'synthetic-installer-schema-fixture' };
  const qualify = (options = {}) => verifyContinuationInstallation({ directory, payload,
    verifyArchive: verifyRuntimeArchive, verifyInstallerArchive: legacyInstallerArchive, installer, ...options });
  return { directory, bytes, installation, payload, receipt, archive, write, qualify };
}

test('original RC10.9 installation metadata derives SHA256 from valid retained bytes without changing originals', () => {
  const f = installationFixture();
  try {
    assert.deepEqual(Object.keys(f.installation).sort(), ['activation', 'archive', 'dependencies', 'directory', 'executable',
      'installedTree', 'lock', 'lockDigest', 'nodeVersion', 'state', 'version']);
    assert.deepEqual(Object.keys(f.installation.archive).sort(), ['bytes', 'integrity', 'package', 'packageVersion', 'scope', 'version']);
    const receipt = readFileSync(f.receipt), archive = readFileSync(f.archive), payload = structuredClone(f.payload);
    const result = f.qualify();
    assert.equal(result.digest, f.payload.archiveDigest); assert.equal(result.integrity, f.installation.archive.integrity);
    assert.equal(result.bytes, archive.length); assert.equal(result.digestSource, 'verified-retained-archive-legacy-metadata');
    assert.equal(result.installer.version, '3.0.0-rc.10.9'); assert.equal(result.installer.recordsArchiveDigest, false);
    assert.deepEqual(result.installer.expectedArchiveFields, Object.keys(f.installation.archive).sort());
    assert.deepEqual(readFileSync(f.receipt), receipt); assert.deepEqual(readFileSync(f.archive), archive);
    assert.deepEqual(f.payload, payload); assert.equal(Object.hasOwn(JSON.parse(readFileSync(f.receipt, 'utf8')).archive, 'digest'), false);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test('legacy archive qualification rejects bad original integrity and changed retained bytes', () => {
  const f = installationFixture();
  try {
    writeFileSync(f.archive, Buffer.concat([f.bytes, Buffer.from('changed bytes')]));
    assert.throws(() => f.qualify(), /Runtime archive integrity mismatch/);
    writeFileSync(f.archive, f.bytes);
    f.installation.lock.artifact.integrity = 'sha512-' + Buffer.alloc(64).toString('base64'); f.write();
    assert.throws(() => f.qualify(), /Runtime archive integrity mismatch/);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test('legacy archive qualification refuses mismatched original lock source and archive descriptor', () => {
  const f = installationFixture();
  try {
    for (const change of [lock => { lock.source_commit = 'b'.repeat(40); },
      lock => { lock.artifact.url = 'https://example.invalid/releases/different.tgz'; }]) {
      const original = f.installation.lock;
      f.installation.lock = structuredClone(original); change(f.installation.lock); f.write();
      assert.throws(() => f.qualify(), /exact original lock and source/);
      f.installation.lock = original; f.write();
    }
    assert.equal(f.qualify().digest, f.payload.archiveDigest);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test('legacy archive qualification refuses contradictory recorded integrity or SHA256 digest', () => {
  const f = installationFixture();
  try {
    f.installation.archive.integrity = 'sha512-' + Buffer.alloc(64).toString('base64'); f.write();
    assert.throws(() => f.qualify(), /Recorded archive integrity differs/);
    f.installation.archive.integrity = f.payload.lock.artifact.integrity;
    for (const digest of ['sha256:' + '0'.repeat(64), null, false]) {
      f.installation.archive.digest = digest; f.write();
      assert.throws(() => f.qualify(), /Recorded archive digest conflicts/);
    }
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test('candidate archive qualification records a legacy installer schema while strictly verifying the whole candidate lock and bytes', () => {
  const f = installationFixture('4.0.0');
  try {
    const original = readFileSync(f.receipt), result = f.qualify();
    assert.equal(result.digest, f.payload.archiveDigest); assert.equal(result.recordedDigest, false);
    assert.equal(result.installer.version, '3.0.0-rc.10.9'); assert.equal(result.installer.recordsArchiveDigest, false);
    assert.equal(result.digestSource, 'verified-retained-archive-legacy-metadata');
    assert.deepEqual(readFileSync(f.receipt), original);
    const lock = f.installation.lock;
    f.installation.lock = { ...lock, source_commit: 'b'.repeat(40) }; f.write();
    assert.throws(() => f.qualify(), /exact original lock and source/);
    f.installation.lock = lock; f.write();
    writeFileSync(f.archive, Buffer.concat([f.bytes, Buffer.from('different candidate bytes')]));
    assert.throws(() => f.qualify(), /Runtime archive integrity mismatch/);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test('candidate archive qualification requires recorded SHA256 when the actual current installer owner produces it', () => {
  const f = installationFixture('4.0.0');
  try {
    assert.throws(() => verifyContinuationInstallation({ directory: f.directory, payload: f.payload,
      verifyArchive: verifyRuntimeArchive }), /Current installer must record/);
    f.installation.archive.digest = f.payload.archiveDigest; f.write();
    const current = { verifyInstallerArchive: verifyRuntimeArchive,
      installer: { package: f.payload.lock.package, version: '4.0.0', scope: 'synthetic-installer-schema-fixture' } };
    const result = f.qualify(current);
    assert.equal(result.digestSource, 'recorded-and-verified-retained-archive');
    assert.equal(result.installer.recordsArchiveDigest, true); assert.equal(result.installer.expectedArchiveFields.includes('digest'), true);
    const original = f.payload.archiveDigest; f.payload.archiveDigest = 'sha256:' + '0'.repeat(64);
    assert.throws(() => f.qualify(current), /Retained archive bytes differ/);
    f.payload.archiveDigest = original;
    assert.equal(f.qualify(current).digest, original);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

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
