import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { releaseAssets } from './release-assets.mjs';
const input = () => ({ manifest: {name:'@organta/project-governance',version:'3.0.0',engines:{node:'>=24.16.0 <25'}}, tag:'3.0.0', repository:'example/governance', sourceCommit:'a'.repeat(40), archiveName:'organta-project-governance-3.0.0.tgz',bytes:Buffer.from('archive') });
test('major release binds exact archive and lock bytes and requires deliberate adoption', () => {
 const value=input(), result=releaseAssets(value),lock=JSON.parse(result.lockText);
 assert.equal(lock.artifact.integrity,'sha512-'+createHash('sha512').update(value.bytes).digest('base64'));
 assert.equal(result.metadata.lock_sha256,createHash('sha256').update(result.lockText).digest('hex'));
 assert.equal(result.metadata.automatic,false);assert.equal(result.metadata.integration_change,true);
 assert.notEqual(releaseAssets({...value,bytes:Buffer.from('changed')}).lockText,result.lockText);
});
test('release refuses mismatched versions, source identity and destination', () => {
 for(const change of [{tag:'3.0.0-preview.1'},{tag:'3.0.1'},{sourceCommit:'abc'},{repository:'example/../../elsewhere'},{archiveName:'other.tgz'}])assert.throws(()=>releaseAssets({...input(),...change}));
});

test('RC identity is explicit and cannot become a stable automatic upgrade', () => {
 for (const tag of ['3.0.0-rc.1', '3.1.0-rc.12']) {
  const original = input();
  const result = releaseAssets({ ...original, tag, manifest: { ...original.manifest, version: tag }, archiveName: `organta-project-governance-${tag}.tgz` });
  assert.equal(JSON.parse(result.lockText).version, tag);
  assert.equal(result.metadata.from_version, tag);
  assert.equal(result.metadata.automatic, false);
  assert.equal(result.metadata.integration_change, true);
 }
 for (const tag of ['3.0.0-preview.1', '3.0.0-beta.1', '3.0.0-rc.0', '3.0.0-rc.01', '3.0.0-rc.1+build']) {
  const original = input();
  assert.throws(() => releaseAssets({ ...original, tag, manifest: { ...original.manifest, version: tag }, archiveName: `organta-project-governance-${tag}.tgz` }));
 }
 assert.equal(releaseAssets(input()).metadata.from_version, '3.0.0');
});

test('release workflow sends prerelease and non-latest flags for RC publication only', async () => {
 const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
 const { tmpdir } = await import('node:os');
 const { join } = await import('node:path');
 const { spawnSync } = await import('node:child_process');
 const { parse } = await import('yaml');
 const workflow = parse(readFileSync(new URL('../../../.github/workflows/release.yml', import.meta.url), 'utf8'));
 const script = workflow.jobs.release.steps.find(step => step.name === 'Publish immutable GitHub release').run;
 const directory = mkdtempSync(join(tmpdir(), 'release-command-proof-'));
 try {
  const record = join(directory, 'calls.jsonl');
  writeFileSync(join(directory, 'gh'), '#!/usr/bin/env node\nrequire("node:fs").appendFileSync(process.env.RELEASE_COMMAND_RECORD, JSON.stringify(process.argv.slice(2))+"\\n");\n', { mode: 0o700 });
  for (const tag of ['3.0.0', '3.0.0-rc.1']) {
   writeFileSync(record, '');
   const result = spawnSync('/bin/bash', ['-eu', '-c', script], { cwd: directory, encoding: 'utf8', env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, GITHUB_REF_NAME: tag, RELEASE_COMMAND_RECORD: record } });
   assert.equal(result.status, 0, result.stderr);
   const calls = readFileSync(record, 'utf8').trim().split('\n').map(line => JSON.parse(line));
   assert.equal(calls.length, 3);
   for (const call of [calls[0], calls[2]]) {
    assert.equal(call.includes('--prerelease'), tag.includes('-rc.'));
    assert.equal(call.includes('--latest=false'), tag.includes('-rc.'));
   }
  }
 } finally { rmSync(directory, { recursive: true, force: true }); }
});
