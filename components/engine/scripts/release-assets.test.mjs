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
