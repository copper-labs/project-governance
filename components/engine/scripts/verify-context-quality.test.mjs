import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest } from '../src/core.ts';
import { qualitySourceDigest } from '../src/context-evaluation-quality.ts';
import { assessContextRoute, contextArchiveDescriptor, contextQualityFixtureReply, freezeContextQualitySuite, qualifyContextArchiveStage,
  stageContextQualityArchive, verifyContextQuality } from './verify-context-quality.mjs';

const suite = freezeContextQualitySuite();
const fixture = id => structuredClone(suite.cases.find(item => item.id === id));
function delivered(input) {
  const route = { receiptId: 'fixture-route', inputDigest: digest('fixture-input'),
    entries: input.request.required.map(item => ({ path: item.id, content: item.excerpt, sourceDigest: item.sourceDigest })),
    optional: { entries: structuredClone(input.request.optional) } };
  const receipt = { receiptId: route.receiptId, inputDigest: route.inputDigest, taskDigest: digest(input.request.purpose), revision: input.request.taskRevision,
    context: route.entries.map(({ content, ...item }) => item), optionalSources: input.request.optional.map(({ excerpt, ...item }) => item),
    metadata: { catalog: { candidates: input.request.optional.map(item => ({ path: item.id })), excluded: [], excludedCount: 0, previewOnly: false },
      sourceIndex: { descriptorCoverage: { descriptorPermittedCount: input.request.optional.length } } } };
  return { route, receipt };
}
function wire(item, name = 'file-0') {
  return { model: 'jev-1.13.0', state: { layout: 'compact-v1', purpose: 'Current synthetic request', items: { c0: item } },
    questions: { [name]: { type: 'noul', instructions: { question: 'Apply state.instructions to state.items.c0.' } } } };
}
const call = request => {
  const response = contextQualityFixtureReply(request);
  return { request, response, outcome: { answers: Object.fromEntries(Object.entries(response.answers).map(([name, answer]) =>
    [name, { status: 'answered', shape: answer.type, probability: answer.noul }])) } };
};

test('full-chain suite freezes balanced source labels, conditions and a separate unused holdout', () => {
  assert.equal(suite.cases.length, 7);
  assert.equal(freezeContextQualitySuite().suiteDigest, suite.suiteDigest);
  assert.equal(suite.reservedHoldout.length, 4);
  assert.ok(suite.reservedHoldout.every(item => !suite.cases.some(value => value.originalLabelDigest === item.labelDigest)));
  for (const item of suite.cases) {
    assert.equal(item.caseDigest, digest({ request: item.request, labels: item.labels, conditions: item.conditions }));
    assert.equal(item.labels.labelSource.independentOfSelector, true);
  }
  const large = fixture('large-file-wrong-passage');
  assert.ok(Buffer.byteLength(large.request.optional[0].excerpt) > 256 * 1024);
  assert.equal(large.labels.units.at(-1).lastLine - large.labels.units.at(-1).firstLine + 1, 4);
  assert.match(fixture('weak-description').request.optional[0].excerpt, /^\/\*\* Miscellaneous helpers/);
});

test('receipt scoring binds exact captured input and leaves unobserved task use unknown', () => {
  const input = fixture('counter-evidence'), { route, receipt } = delivered(input);
  receipt.selection = { passageAdvice: { readingsTruncated: false, readings: input.request.optional.map(item => ({ path: item.id,
    firstLine: null, lastLine: null, assessedRange: null, complete: true, probability: 0.9, interpretation: 'positive' })) } };
  const request = wire({ path: input.request.optional[0].id, facts: { prose: 'Only temporary status retries' } });
  const row = assessContextRoute(input, route, receipt, [call(request)]);
  assert.equal(row.score.essentialGroups.completeDelivered, 3);
  assert.deepEqual(row.score.requiredMissing, []);
  assert.equal(row.actualCalls, 1);
  assert.equal(row.score.boundaries.find(item => item.stage === 'descriptor-answered').observed, 1);
  assert.equal(row.score.boundaries.find(item => item.stage === 'consumed').observed, null);
  assert.equal(row.stages.acceptedTaskOutcome, 'unknown');
  assert.deepEqual(row.semanticFailures, []);
  assert.deepEqual(row.integrityFailures, []);
  assert.ok(row.decisiveSpans.every(item => item.unitCompleteDelivered));
});

test('wrong passage retains the right file hit but loses decisive complete evidence', () => {
  const input = fixture('large-file-wrong-passage'), { route, receipt } = delivered(input), original = input.request.optional[0];
  const sourceLines = original.excerpt.match(/[^\n]*\n|[^\n]+$/gu), excerpt = sourceLines.slice(0, 3).join('');
  route.optional.entries = [{ ...original, excerpt, sourceRange: { firstLine: 1, lastLine: 3, totalLines: sourceLines.length,
    excerptDigest: qualitySourceDigest(excerpt) }, sourceUnits: [{ firstLine: 1, lastLine: sourceLines.length - 4, complete: false }] }];
  const row = assessContextRoute(input, route, receipt, []);
  assert.equal(row.score.essentialGroups.fileDelivered, 2);
  assert.equal(row.score.essentialGroups.completeDelivered, 1);
  assert.deepEqual(row.semanticFailures, ['missing-complete-evidence:lease-release']);
  assert.deepEqual(row.integrityFailures, []);
  assert.ok(row.stages.captured[0].bytes > 256 * 1024);
  assert.equal(row.decisiveSpans.at(-1).unitCompleteDelivered, false);
});

test('provider denial stays distinct from local capture and detects excluded descriptor or body disclosure', () => {
  const input = fixture('provider-permission-exclusion'), { route, receipt } = delivered(input), denied = input.conditions.providerDenied[0];
  const safe = assessContextRoute(input, route, receipt, [call(wire({ path: denied, facts: null }))]);
  assert.equal(safe.score.permissionExclusions.length, 0, 'Local reading is permitted in this fixture');
  assert.equal(safe.stages.captured.some(item => item.id === denied), true);
  assert.deepEqual(safe.disclosure.violations, []);
  const bad = assessContextRoute(input, route, receipt, [call(wire({ path: denied, facts: { prose: 'decisive' } })),
    call(wire({ path: denied, passage: input.request.optional[0].excerpt }, 'evidence-passage-0'))]);
  assert.deepEqual(bad.disclosure.violations.map(item => item.stage), ['descriptor', 'body']);
  assert.equal(bad.integrityFailures.length, 2);
});

test('no-match misses, required loss and missing diagnostics remain visible', () => {
  const input = fixture('no-match'), { route, receipt } = delivered(input);
  delete receipt.metadata;
  route.entries = [];
  const row = assessContextRoute(input, route, receipt, []);
  assert.equal(row.score.noMatch.correct, false);
  assert.equal(row.semanticFailures.includes('no-match-delivered-unrelated-optional-context'), true);
  assert.deepEqual(row.score.requiredMissing, ['AGENTS.md']);
  assert.equal(row.score.boundaries.find(item => item.stage === 'inventory').observed, null);
  assert.equal(row.score.boundaries.find(item => item.stage === 'descriptor-permitted').observed, null);
  assert.equal(row.stages.passage, null);
  assert.match(row.integrityFailures[0], /required-source/);
});

test('frozen-label, receipt and source drift cannot become quality scores', () => {
  const input = fixture('short-resume'), { route, receipt } = delivered(input);
  const drift = structuredClone(receipt); drift.taskDigest = digest('Different request');
  assert.throws(() => assessContextRoute(input, route, drift, []), /purpose differs/);
  drift.taskDigest = receipt.taskDigest; drift.optionalSources[0].sourceDigest = digest('Changed source');
  assert.throws(() => assessContextRoute(input, route, drift, []), /source identity/);
  const relabeled = structuredClone(input); relabeled.labels.units.at(-1).relevance = 'useful';
  assert.throws(() => assessContextRoute(relabeled, route, receipt, []), /Frozen case identity/);
  const changed = structuredClone(route); changed.optional.entries[0].excerpt = 'Unverified replacement';
  assert.match(assessContextRoute(input, changed, receipt, []).integrityFailures[0], /invalid-delivered-source/);
});

test('plausible raw provider answers cannot prove that the runtime accepted descriptors', () => {
  const input = fixture('weak-description'), { route, receipt } = delivered(input);
  const request = wire({ path: input.request.optional[0].id, facts: { prose: 'Miscellaneous helpers.' } }), raw = call(request);
  delete raw.outcome;
  const unknown = assessContextRoute(input, route, receipt, [raw]);
  assert.equal(unknown.score.boundaries.find(item => item.stage === 'descriptor-answered').observed, null);
  raw.outcome = { answers: {}, reason: 'invalid-or-unavailable' };
  const rejected = assessContextRoute(input, route, receipt, [raw]);
  assert.equal(rejected.score.boundaries.find(item => item.stage === 'descriptor-answered').observed, 0);
});

test('freeze-only writes reproducible labels without an installed package or provider token', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'context-quality-freeze-test-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const result = await verifyContextQuality({ packageRoot: '/does-not-exist', output: directory, freezeOnly: true, live: true });
  assert.equal(result.status, 'frozen');
  assert.equal(result.suiteDigest, suite.suiteDigest);
  assert.deepEqual(JSON.parse(readFileSync(result.suitePath, 'utf8')).reservedHoldout, suite.reservedHoldout);
});

test('archive binding rejects missing or mismatched bytes before staging, scoring or dispatch', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'context-quality-archive-test-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const input = { packageRoot: '/does-not-exist', stagingRoot: join(directory, 'stage') };
  await assert.rejects(stageContextQualityArchive(input), /explicit runtime archive/);
  await assert.rejects(stageContextQualityArchive({ ...input, archive: join(directory, 'missing.tgz') }), /archive is unavailable/);
  const archive = join(directory, 'unexecuted-fixture.tgz'); writeFileSync(archive, 'synthetic ordinary bytes; never installed');
  await assert.rejects(stageContextQualityArchive({ ...input, archive, archiveDigest: 'sha256:' + '0'.repeat(64) }), /archive digest differs/);
  await assert.rejects(verifyContextQuality({ packageRoot: '/does-not-exist', output: join(directory, 'proof') }), /Supply --archive/);
  await assert.rejects(verifyContextQuality({ packageRoot: '/does-not-exist', archive, baselinePackageRoot: '/also-does-not-exist',
    output: join(directory, 'mismatch') }), /package and exact archive/);
});

test('archive descriptor capture rejects nonordinary, oversized and final-symlink inputs before reading bytes', t => {
  const directory = mkdtempSync(join(tmpdir(), 'context-quality-archive-boundary-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  assert.throws(() => contextArchiveDescriptor(directory), /bounded ordinary file/);
  const path = join(directory, 'large.tgz'); writeFileSync(path, ''); truncateSync(path, 512 * 1024 * 1024 + 1);
  assert.throws(() => contextArchiveDescriptor(path), /bounded ordinary file/);
  const ordinary = join(directory, 'ordinary.tgz'); writeFileSync(ordinary, 'synthetic bounded archive bytes');
  const link = join(directory, 'linked.tgz'); symlinkSync(ordinary, link);
  assert.throws(() => contextArchiveDescriptor(link));
  assert.equal(contextArchiveDescriptor(ordinary).digest, qualitySourceDigest(readFileSync(ordinary)));
});

test('old SHA512 stage schema qualifies retained SHA256 without inventing inspector fields or weakening exact checks', () => {
  const captured = { digest: qualitySourceDigest('frozen archive bytes'), integrity: 'sha512-frozen-fixture-integrity' };
  const lock = { package: '@organta/project-governance', version: '3.0.0-rc.10.9', artifact: { integrity: captured.integrity } };
  const staged = { state: 'staged', activation: 'not-performed', directory: '/synthetic-stage', executable: '/synthetic-stage/cli.js',
    lock, lockDigest: digest(lock), installedTree: { digest: qualitySourceDigest('exact installed tree'), entries: 1, bytes: 1 },
    archive: { package: lock.package, packageVersion: lock.version, integrity: captured.integrity } };
  const inspection = { state: 'verified', activation: 'not-performed', directory: staged.directory, executable: staged.executable,
    lockDigest: staged.lockDigest, installedTree: structuredClone(staged.installedTree) };
  const input = { staged, inspection, lock, captured, retained: { ...captured } };
  const qualified = qualifyContextArchiveStage(input);
  assert.equal(qualified.archive.digest, captured.digest);
  assert.equal(qualified.evidence.sha256Source, 'bounded-retained-copy-hash');
  assert.equal(qualified.evidence.inspectorArchiveDigest, null);
  assert.equal('archiveDigest' in inspection, false, 'The old owner receipt remains unchanged');
  const modern = structuredClone(input); modern.staged.archive.digest = captured.digest;
  modern.inspection.archiveDigest = captured.digest; modern.inspection.runtimeVersion = lock.version;
  assert.equal(qualifyContextArchiveStage(modern).evidence.sha256Source, 'staging-owner-and-bounded-retained-copy-hash');
  for (const change of [
    value => { value.retained.digest = qualitySourceDigest('different archive bytes'); },
    value => { value.retained.integrity = 'sha512-other-fixture-integrity'; },
    value => { value.staged.archive.integrity = 'sha512-other-fixture-integrity'; },
    value => { value.inspection.lockDigest = qualitySourceDigest('different lock'); },
    value => { value.inspection.installedTree.digest = qualitySourceDigest('different tree'); },
    value => { value.inspection.directory = '/other-stage'; },
    value => { value.inspection.executable = '/other-stage/cli.js'; },
    value => { value.inspection.archiveDigest = qualitySourceDigest('wrong explicit digest'); },
  ]) {
    const changed = structuredClone(input); change(changed);
    assert.throws(() => qualifyContextArchiveStage(changed));
  }
});
