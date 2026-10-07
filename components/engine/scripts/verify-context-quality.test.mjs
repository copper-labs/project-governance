import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest } from '../src/core.ts';
import { qualitySourceDigest } from '../src/context-evaluation-quality.ts';
import { renderPromptContext } from '../src/prompt-context.ts';
import { PROMPT_FRAMING_RESERVE, requiredPromptText } from '../src/prompt-context-budget.ts';
import { assessContextRoute, assessRenderedContext, contextArchiveDescriptor, contextQualityFixtureReply, freezeContextQualitySuite, qualifyContextArchiveStage,
  renderContextQualityReport, stageContextQualityArchive, verifyContextQuality } from './verify-context-quality.mjs';

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

test('full-chain suite freezes balanced source labels, conditions and reserved independent holdouts', () => {
  assert.equal(suite.cases.filter(item => item.split === 'development').length, 15);
  assert.equal(suite.cases.filter(item => item.split === 'holdout').length, 4);
  assert.equal(freezeContextQualitySuite().suiteDigest, suite.suiteDigest);
  assert.equal(suite.reservedHoldout.length, 8);
  assert.ok(suite.reservedHoldout.every(item => !suite.cases.some(value => value.split === 'development' && value.originalLabelDigest === item.labelDigest)));
  for (const item of suite.cases) {
    assert.equal(item.caseDigest, digest({ request: item.request, labels: item.labels, conditions: item.conditions }));
    assert.equal(item.labels.labelSource.independentOfSelector, true);
  }
  const large = fixture('large-file-wrong-passage');
  assert.ok(Buffer.byteLength(large.request.optional[0].excerpt) > 256 * 1024);
  assert.equal(large.labels.units.at(-1).lastLine - large.labels.units.at(-1).firstLine + 1, 4);
  assert.match(fixture('weak-description').request.optional[0].excerpt, /^\/\*\* Miscellaneous helpers/);
});

test('installed selection scoring rejects a table row delivered without its column context', () => {
  const input = fixture('representation-table-units'), { route, receipt } = delivered(input);
  const whole = assessContextRoute(input, route, receipt, []);
  assert.equal(whole.score.essentialGroups.completeDelivered, 2);
  const original = route.optional.entries[0], lines = original.excerpt.match(/[^\n]*\n|[^\n]+$/gu);
  const excerpt = lines[3];
  route.optional.entries = [{ ...original, excerpt, sourceRange: { firstLine: 4, lastLine: 4,
    totalLines: lines.length, excerptDigest: qualitySourceDigest(excerpt), complete: false } }];
  const clipped = assessContextRoute(input, route, receipt, []);
  assert.equal(clipped.score.essentialGroups.fileDelivered, 2);
  assert.equal(clipped.score.essentialGroups.completeDelivered, 1);
  assert.deepEqual(clipped.semanticFailures, ['missing-complete-evidence:radio-storage-columns']);
  assert.equal(clipped.stages.acceptedTaskOutcome, 'unknown');
  assert.equal(clipped.stages.consumed, null);
});

test('native rendering preserves a route-quality failure when framing omits its complete decisive source', () => {
  const input = fixture('weak-description'), { route, receipt } = delivered(input), entryId = 'a'.repeat(64), packetLimitBytes = 32000;
  Object.assign(route, { ready: true, blockers: [], route: { primary: ['AGENTS.md'], active: [],
    budget: { primary_context_tokens: 1000, active_plan_context_tokens: 1000, expansion_context_tokens: 7000, total_context_tokens: 8000 },
    budgetAuthority: { nativePacketBytes: packetLimitBytes } }, skills: { entries: [{ path: 'required/SKILL.md', sourceDigest: qualitySourceDigest('padding'), content: '' }] } });
  const framingBytes = Buffer.byteLength(requiredPromptText(route.entries, route.skills.entries, entryId, route.receiptId).text);
  route.skills.entries[0].content = 'Q'.repeat(packetLimitBytes - PROMPT_FRAMING_RESERVE - framingBytes - 80);
  route.skills.entries[0].sourceDigest = qualitySourceDigest(route.skills.entries[0].content);
  const requiredText = requiredPromptText(route.entries, route.skills.entries, entryId, route.receiptId).text;
  const rendered = renderPromptContext(route, { state: 'unavailable', candidates: [], inspected: 0, omissions: [] }, entryId);
  assert.equal(rendered.status, 'prepared'); assert.deepEqual(rendered.delivered, []);
  assert.deepEqual(assessContextRoute(input, route, receipt, []).semanticFailures, []);
  const final = assessRenderedContext(input, route, receipt, [], { rendered, requiredText, packetLimitBytes });
  assert.equal(final.rendering.requiredComplete, true); assert.equal(final.rendering.envelopeRespected, true);
  assert.deepEqual(final.rendering.omittedOptionalSources, [input.request.optional[0].id]);
  assert.ok(final.rendering.lostDecisiveUnits.includes('conversion'));
  assert.equal(final.score.essentialGroups.completeDelivered, 1);
  assert.ok(final.semanticFailures.some(value => value.startsWith('missing-complete-evidence:')));
  assert.deepEqual(final.routeSemanticFailures, []); assert.equal(final.rendering.hostDelivery, 'unknown');
  assert.equal(final.rendering.hostConsumption, 'unknown'); assert.equal(final.stages.acceptedTaskOutcome, 'unknown');
});

test('blocked required guidance and oversized final bytes cannot qualify as successful native delivery', () => {
  const input = fixture('weak-description'), { route, receipt } = delivered(input);
  const final = assessRenderedContext(input, route, receipt, [], { rendered: { status: 'blocked', text: 'Required context unavailable', delivered: [] },
    requiredText: 'Required original', packetLimitBytes: 10 });
  assert.equal(final.rendering.requiredComplete, false); assert.equal(final.rendering.envelopeRespected, false);
  assert.ok(final.integrityFailures.includes('native-required-context-not-intact'));
  assert.ok(final.integrityFailures.includes('native-packet-exceeds-envelope'));
  assert.deepEqual(final.score.requiredMissing, ['AGENTS.md']);
  assert.throws(() => assessRenderedContext(input, route, receipt, [], { rendered: { status: 'blocked', text: '', delivered: ['src/converter.ts'] },
    requiredText: 'Required original', packetLimitBytes: 32000 }), /Blocked rendering claims/);
});

test('offline rendering refuses changed frozen originals before inspecting a runtime or dispatching', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'context-quality-render-drift-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const frozenSuite = join(directory, 'suite.json'), renderReport = join(directory, 'report.json'), changed = structuredClone(suite);
  changed.cases[0].request.purpose = 'Relabeled after observing results';
  writeFileSync(frozenSuite, JSON.stringify(changed));
  writeFileSync(renderReport, JSON.stringify({ frozenSuite, suiteDigest: suite.suiteDigest, assignedTrials: 1 }));
  await assert.rejects(renderContextQualityReport({ renderReport, output: join(directory, 'proof') }), /Retained frozen suite identity differs/);
});

test('4.1 source cases preserve six task needs, independent holdouts and complete decisive units', () => {
  const cases = suite.cases.filter(item => item.id.startsWith('4-1-') && item.split === 'development');
  assert.deepEqual(cases.map(item => item.id), ['4-1-weak-description', '4-1-near-match', '4-1-long-decisive-span',
    '4-1-mixed-status-fix', '4-1-permission-separation', '4-1-true-no-match']);
  assert.ok(cases.every(item => item.originalLabelDigest && item.originalInputDigest));
  assert.equal(fixture('4-1-weak-description').labels.sources.find(item => item.candidateId === 'src/value-helper.ts').description.quality, 'weak');
  const large = fixture('4-1-long-decisive-span');
  assert.ok(Buffer.byteLength(large.request.optional[0].excerpt) > 256 * 1024);
  const decisive = large.labels.units.find(item => item.id === 'complete-owned-shutdown'), text = large.request.optional[0].excerpt.split(/(?<=\n)/u)
    .slice(decisive.firstLine - 1, decisive.lastLine).join('');
  assert.ok(Buffer.byteLength(text) > 512 && Buffer.byteLength(text) < large.conditions.optionalExcerptBytes);
  assert.match(text, /await session\.pendingOutput/); assert.match(text, /finally/); assert.match(text, /active\.id === session\.id/);
  assert.match(fixture('4-1-mixed-status-fix').request.purpose, /update.*then fix/u);
  const mixedLabels = fixture('4-1-mixed-status-fix').labels;
  assert.equal(mixedLabels.essentialGroups.length, 4); // Required instructions plus status, implementation and counter-case.
  assert.equal(fixture('4-1-true-no-match').labels.noMatch, true);
  const permission = fixture('4-1-permission-separation');
  assert.equal(permission.labels.sources.find(item => item.candidateId === permission.conditions.providerDenied[0]).bodyPermission, 'permitted');
  assert.equal(permission.request.optional.length, 2, 'Provider denial does not forbid local reading');
  const absent = fixture('4-1-holdout-unavailable-resource');
  assert.equal(absent.split, 'holdout'); assert.deepEqual(absent.conditions.unavailableSources, ['src/local-export.ts']);
  assert.equal(absent.request.optional.some(item => item.id === 'src/local-export.ts'), false);
  const { route, receipt } = delivered(absent), assessment = assessContextRoute(absent, route, receipt, []);
  assert.deepEqual(assessment.semanticFailures, ['missing-complete-evidence:export-authorization']);
  assert.deepEqual(assessment.score.permissionExclusions, [{ candidateId: 'src/local-export.ts', reason: 'upstream-resource-not-installed' }]);
});

test('separated table columns and row are both observed and a bare row remains a final-delivery miss', () => {
  const input = fixture('representation-deep-table-row'), { route, receipt } = delivered(input);
  receipt.selection = { passageAdvice: { readingsTruncated: false, readings: [{ path: input.request.optional[0].id,
    firstLine: 40, lastLine: 40, assessedRange: null, assessedRanges: [{ firstLine: 2, lastLine: 3 }, { firstLine: 40, lastLine: 40 }],
    complete: true, probability: 0.95, interpretation: 'positive' }] } };
  const row = assessContextRoute(input, route, receipt, []);
  assert.equal(row.score.judgments.positive, 2);
  assert.equal(row.score.essentialGroups.completeDelivered, 3);
  const original = route.optional.entries[0], text = original.excerpt.match(/[^\n]*\n|[^\n]+$/gu)[39];
  route.optional.entries = [{ ...original, excerpt: text, sourceRange: { firstLine: 40, lastLine: 40,
    totalLines: 40, excerptDigest: qualitySourceDigest(text), complete: false } }];
  const clipped = assessContextRoute(input, route, receipt, []);
  assert.deepEqual(clipped.semanticFailures, ['missing-complete-evidence:radio-contract-columns']);
  assert.equal(clipped.score.essentialGroups.completeDelivered, 2);
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
