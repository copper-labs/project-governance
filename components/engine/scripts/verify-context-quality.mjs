import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { closeSync, constants, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { digest } from '../src/core.ts';
import * as sourceQuality from '../src/context-evaluation-quality.ts';
import { nativeOptionalEntries } from './verify-bound-continuation.mjs';
import { contextQualityDevelopment, contextQualityHoldout, contextQuality41Development, contextQuality41Holdout,
  contextQuality41Conditions, contextQualityRepresentation, contextQualityRepresentation41 } from '../test/fixtures/context-quality-frozen.ts';

const SUITE = 'installed-context-quality-development-4';
const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const rawDigest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const lines = value => value.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
const source = (candidateId, text, extra = {}) => ({ candidateId, text, sourceDigest: rawDigest(text), bodyPermission: 'permitted', exclusionReason: null, ...extra });
const unit = (id, item, firstLine, lastLine, relevance) => ({ id, candidateId: item.candidateId, firstLine, lastLine,
  rangeDigest: rawDigest(lines(item.text).slice(firstLine - 1, lastLine).join('')), relevance });
const required = source('AGENTS.md', '# Required instructions\nDo not publish without operator authorization.\nKeep cleanup uncertainty visible.\n');
const requiredUnit = unit('mandatory-instructions', required, 1, 3, 'useful');
const SELECTION_QUESTIONS = ['context.metadata-relevance/1', 'context.passage-evidence/1', 'context.passage-role/1'];
const unrelated = source('docs/colors.md', '# Color palette\nUse a blue highlight.\n');
const unrelatedUnit = unit('unrelated-colors', unrelated, 1, 2, 'irrelevant');

/** Expectations and transport policy are frozen before any route invocation. Holdout needs explicit selection. */
export function freezeContextQualitySuite() {
  const reused = ['counter-evidence', 'weak-description', 'short-resume', 'steering-multi-intent'].map(id => {
    const fixture = contextQualityDevelopment.find(item => item.id === id);
    return { id, purpose: fixture.request.purpose, sources: structuredClone(fixture.qualityLabels.sources),
      units: structuredClone(fixture.qualityLabels.units), groups: structuredClone(fixture.qualityLabels.essentialGroups),
      originalLabelDigest: fixture.qualityLabels.labelDigest, originalInputDigest: fixture.qualityLabels.inputDigest };
  });
  // Weak authored prose is genuinely present in the source seen by the installed descriptor owner.
  const weak = reused.find(item => item.id === 'weak-description');
  weak.sources = [source('src/converter.ts', '/** Miscellaneous helpers. */\nexport function apply(value) {\n  return value * 1000;\n}\n',
    { description: { text: 'Miscellaneous helpers.', quality: 'weak' } })];
  weak.units = [unit('conversion', weak.sources[0], 1, 4, 'useful')];
  const denied = source('src/undisclosed.ts', 'export function restrictedCondition() {\n  return "decisive-public-fixture";\n}\n');
  const largeText = 'export function style() {\n' + Array.from({ length: 6500 }, (_, index) => `  const shade${index} = "routine appearance detail ${index}";\n`).join('') +
    '  return "blue";\n}\nexport function release(lease) {\n  lease.owner = null;\n  lease.closed = true;\n}\n';
  const large = source('src/lease.ts', largeText), count = lines(largeText).length;
  const fromFrozen = (item, holdout = false) => ({ id: item.id, purpose: item.request.purpose,
    sources: structuredClone(item.qualityLabels.sources), units: structuredClone(item.qualityLabels.units),
    groups: structuredClone(item.qualityLabels.essentialGroups), noMatch: item.qualityLabels.noMatch,
    optionalExcerptBytes: item.request.optionalExcerptBytes, ...structuredClone(contextQuality41Conditions[item.id] ?? {}),
    holdout, originalLabelDigest: item.qualityLabels.labelDigest, originalInputDigest: item.qualityLabels.inputDigest });
  const cases = [...reused,
    { id: 'no-match', purpose: 'Find a database migration', sources: [unrelated], units: [unrelatedUnit], groups: [], noMatch: true },
    { id: 'provider-permission-exclusion', purpose: 'Find the decisive restricted condition', sources: [denied, unrelated],
      units: [unit('restricted-condition', denied, 1, 3, 'useful'), unrelatedUnit],
      groups: [{ id: 'restricted-condition', unitIds: ['restricted-condition'], required: false }], providerDenied: [denied.candidateId] },
    { id: 'large-file-wrong-passage', purpose: 'Inspect release of an owned lease', sources: [large],
      units: [unit('wrong-style-passage', large, 1, count - 4, 'irrelevant'), unit('decisive-release', large, count - 3, count, 'useful')],
      groups: [{ id: 'lease-release', unitIds: ['decisive-release'], required: false }] },
    ...contextQuality41Development.map(item => fromFrozen(item)), ...contextQuality41Holdout.map(item => fromFrozen(item, true)),
    ...[...contextQualityRepresentation, ...contextQualityRepresentation41].map(item => fromFrozen(item))];
  const frozen = cases.map(item => {
    const sources = [required, ...item.sources], units = [requiredUnit, ...item.units];
    const conditions = { maximumBytes: 32000, optionalExcerptBytes: item.optionalExcerptBytes ?? 512, maxCandidates: 12, evidenceBytes: 8192,
      maxCalls: 16, maxRequestBytes: 131072, providerDenied: item.providerDenied ?? [], localBodyPermission: 'ordinary-synthetic-files-permitted',
      unavailableSources: item.unavailableSources ?? [],
      entry: 'public-context-route-explicit-current-request', hostResumeQualified: false };
    const request = { taskRevision: `${item.id}-current`, purpose: item.purpose, maximumBytes: conditions.maximumBytes,
      optionalExcerptBytes: conditions.optionalExcerptBytes, required: [{ id: required.candidateId, excerpt: required.text, sourceDigest: required.sourceDigest }],
      optional: item.sources.filter(candidate => candidate.bodyPermission !== 'excluded').map(candidate => ({ id: candidate.candidateId, excerpt: candidate.text, sourceDigest: candidate.sourceDigest })) };
    const body = { version: 1, suiteVersion: SUITE, inputDigest: digest(request),
      labelSource: { kind: 'source-backed-fixture', reference: `synthetic-installed-quality:${item.id}:authored-before-results`, independentOfSelector: true },
      sources, units, essentialGroups: [{ id: 'mandatory-guidance', unitIds: [requiredUnit.id], required: true }, ...item.groups],
      noMatch: item.noMatch ?? false, fullyLabeled: true };
    const labels = { ...body, labelDigest: sourceQuality.contextQualityLabelDigest(body) };
    sourceQuality.validateContextQualityLabels(request, labels);
    return { id: item.id, split: item.holdout ? 'holdout' : 'development', request, labels, conditions, originalLabelDigest: item.originalLabelDigest ?? null,
      originalInputDigest: item.originalInputDigest ?? null, caseDigest: digest({ request, labels, conditions }) };
  });
  const body = { version: 1, suiteVersion: SUITE, cases: frozen, responsePolicyDigest: digest(contextQualityFixtureReply.toString()),
    reservedHoldout: [...contextQualityHoldout, ...contextQuality41Holdout].map(item => ({ id: item.id, inputDigest: item.qualityLabels.inputDigest, labelDigest: item.qualityLabels.labelDigest })),
    claims: { controlledProvider: 'transport-and-selection-wiring-only', liveProvider: 'measured-against-frozen-expectations',
      hostConsumption: 'unknown', acceptedTaskOutcome: 'unknown', totalTaskTokens: null } };
  return { ...body, suiteDigest: digest(body) };
}

/** Controlled answers depend only on transmitted evidence. They never consult quality labels. */
export function contextQualityFixtureReply(wire) {
  const items = wire.state?.items ?? {};
  const answers = Object.fromEntries(Object.entries(wire.questions).map(([name, question]) => {
    const compactId = question.instructions?.question?.match(/state\.items\.(c\d+)/u)?.[1];
    const item = compactId ? items[compactId] : null;
    if (!item) throw new Error('Unsupported controlled context wire layout');
    if (question.type === 'choice') {
      const keys = Object.keys(question.criteria), choice = keys.includes('unknown') ? 'unknown' : keys[0];
      return [name, { type: 'choice', choice, confidence: 1, probabilities: Object.fromEntries(keys.map(key => [key, key === choice ? 1 : 0])) }];
    }
    // Metadata admits inspectable candidates. Passage answers exercise independently scored misses too.
    const text = item.passage ?? JSON.stringify(item.facts ?? item.path);
    const meaningful = item.passage === undefined ? !/colors|previous|theme/iu.test(item.path) :
      /owner\s*=\s*null|closed\s*=\s*true|temporary|denied|\*\s*1000|Cleanup remains uncertain|owned process exited|decisive-public-fixture/iu.test(text);
    return [name, { type: 'noul', noul: meaningful ? 0.9 : 0.1 }];
  }));
  return { model: wire.model ?? 'jev-1.13.0', usage: { input_tokens: 100, output_tokens: 10 }, answers };
}

function wireObservations(calls) {
  const metadata = [], passages = [];
  for (const call of calls) for (const [name, question] of Object.entries(call.request.questions ?? {})) {
    const compactId = question.instructions?.question?.match(/state\.items\.(c\d+)/u)?.[1];
    const item = compactId ? call.request.state?.items?.[compactId] : null;
    if (!item) continue;
    const answer = call.response?.answers?.[name], rawAnswerValid = answer?.type === 'noul' && Number.isFinite(answer.noul) && answer.noul >= 0 && answer.noul <= 1;
    const accepted = call.outcome?.answers?.[name], answered = call.outcome ? accepted?.status === 'answered' && accepted.shape === 'noul' : null;
    if (item.passage !== undefined) passages.push({ ...item, question: name, answered, rawAnswerValid, answer: answered ? accepted.probability : null });
    else metadata.push({ path: item.path, facts: item.facts, question: name, answered, rawAnswerValid, answer: answered ? accepted.probability : null });
  }
  return { metadata, passages };
}

/** Map existing receipts to scorer observations. Missing previews and host use remain unknown. */
export function assessContextRoute(fixture, route, receipt, calls, quality = sourceQuality) {
  assert.equal(fixture.caseDigest, digest({ request: fixture.request, labels: fixture.labels, conditions: fixture.conditions }), 'Frozen case identity differs');
  assert.equal(route.receiptId, receipt.receiptId, 'Route receipt identity differs');
  assert.equal(route.inputDigest, receipt.inputDigest, 'Route input identity differs');
  assert.equal(receipt.taskDigest, digest(fixture.request.purpose), 'Route purpose differs from frozen request');
  assert.equal(receipt.revision, fixture.request.taskRevision, 'Route revision differs from frozen request');
  const byId = new Map(fixture.labels.sources.map(item => [item.candidateId, item]));
  const captured = receipt.optionalSources ?? [], requiredEntries = (route.entries ?? []).map(entry => ({ id: entry.path, sourceDigest: entry.sourceDigest, excerpt: entry.content }));
  assert.equal(new Set(captured.map(item => item.id)).size, captured.length, 'Captured source IDs repeat');
  for (const item of captured) assert.equal(item.sourceDigest, byId.get(item.id)?.sourceDigest, `Unexpected captured source identity: ${item.id}`);
  const request = { ...fixture.request, optional: captured.map(item => ({ id: item.id, sourceDigest: item.sourceDigest, excerpt: byId.get(item.id).text })) };
  const labelsBody = { ...fixture.labels, inputDigest: digest(request) }, labels = { ...labelsBody, labelDigest: quality.contextQualityLabelDigest(labelsBody) };
  const entries = [...requiredEntries, ...(route.optional?.entries ?? [])];
  const knownIds = values => [...new Set(values)].filter(id => byId.has(id));
  const observation = { stages: [] };
  const stage = (name, ids, missingReason) => {
    const candidateIds = knownIds(ids);
    observation.stages.push({ stage: name, candidateIds,
      omissions: fixture.labels.sources.filter(item => !candidateIds.includes(item.candidateId)).map(item => ({ candidateId: item.candidateId, reason: missingReason })) });
  };
  const catalog = receipt.metadata?.catalog;
  if (catalog && !catalog.previewOnly && catalog.excludedCount <= (catalog.excluded?.length ?? 0))
    stage('inventory', [...catalog.candidates.map(item => item.path), ...catalog.excluded.map(item => item.path), ...receipt.context.map(item => item.path)], 'not-in-receipted-inventory');
  stage('body-permitted', [...captured.map(item => item.id), ...requiredEntries.map(item => item.id)], 'local-body-not-captured');
  const transport = wireObservations(calls), sourceIds = [...byId.keys()];
  const descriptorPermitted = sourceIds.filter(id => id !== required.candidateId && !fixture.conditions.providerDenied.includes(id));
  if (receipt.metadata?.sourceIndex?.descriptorCoverage) stage('descriptor-permitted', descriptorPermitted, 'provider-descriptor-scope-or-required-local-context');
  stage('descriptor-submitted', transport.metadata.filter(item => item.facts !== null && item.facts !== undefined).map(item => item.path), 'no-observed-descriptor-transmission');
  if (transport.metadata.every(item => item.answered !== null)) stage('descriptor-answered', transport.metadata
    .filter(item => item.facts !== null && item.facts !== undefined && item.answered).map(item => item.path), 'no-valid-receipted-descriptor-answer');
  const passage = receipt.selection?.passageAdvice;
  if (passage && !passage.readingsTruncated) {
    stage('judged', passage.readings.filter(item => item.probability !== null).map(item => item.path), 'no-observed-valid-passage-reading');
    observation.judgments = fixture.labels.units.filter(item => item.candidateId !== required.candidateId).map(item => {
      const readings = passage.readings.filter(reading => reading.path === item.candidateId && reading.complete &&
        (reading.assessedRanges ? reading.assessedRanges.some(range => range.firstLine <= item.firstLine && range.lastLine >= item.lastLine) :
          reading.assessedRange ? reading.assessedRange.firstLine <= item.firstLine && reading.assessedRange.lastLine >= item.lastLine :
          reading.firstLine === null && reading.lastLine === null));
      const reading = readings.find(value => value.probability !== null) ?? readings[0];
      return { unitId: item.id, value: reading ? ['positive', 'uncertain', 'negative'].includes(reading.interpretation) ? reading.interpretation : 'unavailable' : 'omitted' };
    });
  }
  const disclosureViolations = transport.metadata.filter(item => fixture.conditions.providerDenied.includes(item.path) && item.facts !== null && item.facts !== undefined)
    .map(item => ({ path: item.path, stage: 'descriptor' }));
  disclosureViolations.push(...transport.passages.filter(item => fixture.conditions.providerDenied.includes(item.path)).map(item => ({ path: item.path, stage: 'body' })));
  const score = quality.scoreContextQuality(request, labels, entries, observation);
  const decisiveSpans = fixture.labels.essentialGroups.flatMap(group => group.unitIds.map(id => {
    const item = fixture.labels.units.find(unit => unit.id === id);
    const singleBody = { ...labels, essentialGroups: [{ ...group, unitIds: [id] }] }, single = { ...singleBody, labelDigest: quality.contextQualityLabelDigest(singleBody) };
    const selected = entries.find(entry => entry.id === item.candidateId);
    return { groupId: group.id, unitId: id, path: item.candidateId, firstLine: item.firstLine, lastLine: item.lastLine, rangeDigest: item.rangeDigest,
      fileDelivered: Boolean(selected), unitCompleteDelivered: quality.scoreContextQuality(request, single, entries).essentialGroups.completeDelivered === 1 };
  }));
  return { frozenCaseDigest: fixture.caseDigest, frozenInputDigest: fixture.request && digest(fixture.request), frozenLabelDigest: fixture.labels.labelDigest,
    inputDigest: score.inputDigest, labelDigest: score.labelDigest, routeInputDigest: receipt.inputDigest, score, decisiveSpans,
    stages: { metadataCoverage: receipt.metadata?.coverage ?? null, descriptorCoverage: receipt.metadata?.sourceIndex?.descriptorCoverage ?? null,
      passage: passage ? { reason: passage.reason, eligibleUnits: passage.eligibleUnitCount, preparedUnits: passage.preparedUnitCount,
        assessedUnits: passage.assessedUnitCount, readings: passage.readings, readingsTruncated: passage.readingsTruncated } : null,
      captured: captured.map(item => ({ ...item, bytes: Buffer.byteLength(byId.get(item.id).text) })),
      delivered: entries.map(({ excerpt, ...item }) => ({ ...item, excerptDigest: rawDigest(excerpt), bytes: Buffer.byteLength(excerpt) })),
      consumed: null, acceptedTaskOutcome: 'unknown', totalTaskTokens: null },
    disclosure: { providerDenied: fixture.conditions.providerDenied, descriptorPaths: knownIds(transport.metadata.filter(item => item.facts != null).map(item => item.path)),
      bodyPaths: knownIds(transport.passages.map(item => item.path)), violations: disclosureViolations },
    actualCalls: calls.length, metadataCalls: calls.filter(call => wireObservations([call]).metadata.length).length,
    passageCalls: calls.filter(call => wireObservations([call]).passages.length).length,
    semanticFailures: [...score.essentialGroups.missed.map(group => `missing-complete-evidence:${group}`),
      ...(score.noMatch.expected && score.noMatch.correct === false ? ['no-match-delivered-unrelated-optional-context'] : [])],
    integrityFailures: [...score.requiredMissing.map(id => `required-source-changed-or-missing:${id}`),
      ...score.invalidSources.map(item => `invalid-delivered-source:${item.candidateId}:${item.reason}`),
      ...disclosureViolations.map(item => `provider-disclosure-excluded:${item.path}:${item.stage}`)] };
}

/** Score only original source blocks that survived the exact native renderer, not route membership. */
export function assessRenderedContext(fixture, route, receipt, calls, { rendered, requiredText, packetLimitBytes }, quality = sourceQuality) {
  assert.ok(rendered && typeof rendered.text === 'string' && ['prepared', 'blocked'].includes(rendered.status), 'Invalid native rendering');
  assert.ok(Number.isSafeInteger(packetLimitBytes) && packetLimitBytes > 0, 'Invalid native rendering envelope');
  assert.ok(typeof requiredText === 'string' && requiredText.length > 0, 'Required native framing is unavailable');
  const routeAssessment = assessContextRoute(fixture, route, receipt, calls, quality);
  const requiredComplete = rendered.status === 'prepared' && rendered.text.startsWith(requiredText);
  const optional = rendered.status === 'prepared' ? nativeOptionalEntries(route.optional, rendered.text, rendered.delivered) : [];
  if (rendered.status === 'blocked') assert.deepEqual(rendered.delivered, [], 'Blocked rendering claims optional delivery');
  const assessment = assessContextRoute(fixture, { ...route, entries: requiredComplete ? route.entries : [],
    optional: { ...route.optional, entries: optional } }, receipt, calls, quality);
  const packetBytes = Buffer.byteLength(rendered.text), envelopeRespected = packetBytes <= packetLimitBytes;
  if (!requiredComplete) assessment.integrityFailures.push('native-required-context-not-intact');
  if (!envelopeRespected) assessment.integrityFailures.push('native-packet-exceeds-envelope');
  return { ...assessment, routeSemanticFailures: routeAssessment.semanticFailures,
    rendering: { status: rendered.status, packetDigest: rawDigest(rendered.text), packetBytes, packetLimitBytes, envelopeRespected,
      requiredComplete, requiredSources: [...(route.entries ?? []), ...(route.skills?.entries ?? [])].map(item => item.path),
      routeOptionalSources: (route.optional?.entries ?? []).map(item => item.id), nativeOptionalSources: optional.map(item => item.id),
      omittedOptionalSources: (route.optional?.entries ?? []).filter(item => !optional.some(value => value.id === item.id)).map(item => item.id),
      lostDecisiveUnits: routeAssessment.decisiveSpans.filter(item => item.unitCompleteDelivered &&
        !assessment.decisiveSpans.find(value => value.unitId === item.unitId)?.unitCompleteDelivered).map(item => item.unitId),
      factsDelivered: rendered.factsDelivered ?? null, historyDelivered: rendered.historyDelivered ?? false,
      hostDelivery: 'unknown', hostConsumption: 'unknown' } };
}

function profileFor(fixture, arm) {
  const bodyPaths = fixture.labels.sources.filter(item => item.candidateId !== required.candidateId && !fixture.conditions.providerDenied.includes(item.candidateId)).map(item => item.candidateId);
  return { profile_id: 'synthetic-context-quality', continuity: { decisions: { mode: arm === 'jev' ? 'auto' : 'off',
    allowed_data_classes: ['metadata', 'source'], allowed_metadata_paths: ['**'], allowed_source_paths: bodyPaths,
    max_candidates: fixture.conditions.maxCandidates, evidence_bytes: fixture.conditions.evidenceBytes,
    budget: { max_calls: fixture.conditions.maxCalls, max_request_bytes: fixture.conditions.maxRequestBytes },
    consumers: { DL03: { mode: arm === 'jev' ? 'auto' : 'off', questions: ['context.metadata-relevance/1', 'context.passage-evidence/1', 'context.passage-role/1'] } } } },
    context_router: { default_route: 'synthetic', optional_excerpt_bytes: fixture.conditions.optionalExcerptBytes,
      routes: [{ id: 'synthetic', primary_context: [required.candidateId], token_budget: { primary_context_tokens: 1000, active_plan_context_tokens: 1000,
        expansion_context_tokens: 7000, total_context_tokens: fixture.conditions.maximumBytes / 4 } }] } };
}

function writeJson(path, value) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); }
function outsideCheckout(output) {
  const checkout = realpathSync(fileURLToPath(new URL('../../..', import.meta.url)));
  const requested = resolve(output); let ancestor = requested;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const path = resolve(realpathSync(ancestor), relative(ancestor, requested)), rel = relative(checkout, path);
  if (!rel || !rel.startsWith('..') && !isAbsolute(rel)) throw new Error('Keep proof evidence outside this checkout');
  mkdirSync(path, { recursive: true }); return realpathSync(path);
}
function packageIdentity(packageRoot) {
  const root = realpathSync(resolve(packageRoot)), launcher = join(root, 'dist/engine/src/cli.js');
  assert.ok(existsSync(launcher), 'Build or install the package before full-chain verification');
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return { root, version: manifest.version, launcher, launcherDigest: rawDigest(readFileSync(launcher)), manifestDigest: rawDigest(readFileSync(join(root, 'package.json'))) };
}

/** Record the executing package's questions, not today's checkout wording, for paired comparisons. */
async function selectionQuestionIdentity(packageRoot) {
  const ownerPath = join(packageRoot, 'dist/engine/src/decision-catalog.js');
  const { DECISION_QUESTIONS } = await import(pathToFileURL(ownerPath).href);
  const definitions = Object.fromEntries(SELECTION_QUESTIONS.map(id => {
    assert.ok(DECISION_QUESTIONS[id], `The executing package lacks ${id}`);
    return [id, DECISION_QUESTIONS[id]];
  }));
  return { ownerPath, ownerDigest: rawDigest(readFileSync(ownerPath)), definitionDigest: digest(definitions), definitions };
}

/** The supplied package hosts staging code; only its verified archive stage may execute a trial. */
export async function stageContextQualityArchive({ packageRoot, archive, archiveDigest, stagingRoot }) {
  assert.ok(archive, 'Supply an explicit runtime archive; a package directory cannot establish archive identity');
  assert.ok(existsSync(archive), 'The explicit runtime archive is unavailable');
  const archivePath = resolve(archive), descriptor = contextArchiveDescriptor(archivePath), expectedDigest = descriptor.digest;
  if (archiveDigest !== undefined) {
    assert.match(archiveDigest, /^sha256:[a-f0-9]{64}$/u, 'Archive digest must be an exact SHA256 identity');
    assert.equal(expectedDigest, archiveDigest, 'Explicit runtime archive digest differs');
  }
  const supplied = packageIdentity(packageRoot), manifest = JSON.parse(readFileSync(join(supplied.root, 'package.json'), 'utf8'));
  const ownerPath = join(supplied.root, 'dist/engine/src/runtime-staging.js');
  const inspectorPath = join(supplied.root, 'dist/engine/src/runtime-inspection.js');
  assert.ok(existsSync(ownerPath) && existsSync(inspectorPath), 'The supplied package lacks the runtime staging/inspection owner');
  const { stageRuntimeArchive } = await import(pathToFileURL(ownerPath).href);
  const { inspectRuntimeGeneration } = await import(pathToFileURL(inspectorPath).href);
  const lock = { schema_version: 2, package: manifest.name, version: manifest.version,
    artifact: { url: pathToFileURL(archivePath).href, integrity: descriptor.integrity },
    source_commit: 'a'.repeat(40), node: manifest.engines.node, configuration_schema: 1 };
  const staged = stageRuntimeArchive(archivePath, lock, stagingRoot), inspection = inspectRuntimeGeneration(staged.directory);
  const retainedPath = join(staged.directory, 'runtime.tgz');
  const qualification = qualifyContextArchiveStage({ staged, inspection, lock, captured: descriptor, retained: contextArchiveDescriptor(retainedPath) });
  const root = join(staged.directory, 'node_modules/@organta/project-governance'), identity = packageIdentity(root);
  assert.equal(identity.launcher, staged.executable, 'The trial launcher must belong to the verified stage');
  const receiptPath = join(staged.directory, 'installation.json');
  const receiptDigest = rawDigest(readFileSync(receiptPath));
  return { identity: { ...identity, archive: { path: archivePath, retainedPath, ...qualification.archive },
    stage: { directory: staged.directory, executable: staged.executable, lockDigest: staged.lockDigest,
      installedTreeDigest: staged.installedTree.digest, receiptPath, receiptDigest, inspection,
      archiveQualification: qualification.evidence,
      activation: 'not-performed', sourceCommit: { value: lock.source_commit, provenance: 'synthetic-staging-fixture-only; release-provenance-unavailable' } },
    stagingOwner: { suppliedPackage: supplied, path: ownerPath, digest: rawDigest(readFileSync(ownerPath)),
      inspectorPath, inspectorDigest: rawDigest(readFileSync(inspectorPath)) } },
    inspect() {
      const current = inspectRuntimeGeneration(staged.directory);
      const currentQualification = qualifyContextArchiveStage({ staged, inspection: current, lock, captured: descriptor,
        retained: contextArchiveDescriptor(retainedPath) });
      assert.deepEqual(current, inspection, 'Staged runtime identity changed during context-quality trials');
      assert.deepEqual(currentQualification, qualification, 'Staged archive qualification changed during context-quality trials');
      assert.equal(rawDigest(readFileSync(receiptPath)), receiptDigest, 'Staging receipt changed during context-quality trials');
      return current;
    } };
}

/** Older inspectors verify SHA512 and the tree/lock but do not return the archive's SHA256. */
export function qualifyContextArchiveStage({ staged, inspection, lock, captured, retained }) {
  assert.equal(staged.state, 'staged'); assert.equal(staged.activation, 'not-performed');
  assert.equal(inspection.state, 'verified'); assert.equal(inspection.activation, 'not-performed');
  assert.deepEqual(staged.lock, lock, 'Staged runtime lock differs from the requested lock');
  assert.equal(staged.lockDigest, digest(lock), 'Staged runtime lock digest differs');
  assert.equal(inspection.lockDigest, staged.lockDigest, 'Stage inspection lock differs');
  assert.equal(inspection.directory, staged.directory, 'Stage inspection directory differs');
  assert.equal(inspection.executable, staged.executable, 'Stage inspection executable differs');
  assert.deepEqual(inspection.installedTree, staged.installedTree, 'Stage inspection tree differs');
  assert.equal(staged.archive.integrity, lock.artifact.integrity, 'Staged archive integrity differs from the lock');
  assert.equal(staged.archive.package, lock.package, 'Staged archive package differs');
  assert.equal(staged.archive.packageVersion, lock.version, 'Staged archive version differs');
  assert.equal(captured.integrity, staged.archive.integrity, 'Staged archive differs from captured SHA512');
  assert.equal(retained.integrity, staged.archive.integrity, 'Retained archive differs from verified SHA512');
  assert.equal(retained.digest, captured.digest, 'Executed archive differs from captured SHA256');
  if (staged.archive.digest !== undefined) assert.equal(staged.archive.digest, retained.digest, 'Staged archive SHA256 differs');
  if (inspection.archiveDigest !== undefined) assert.equal(inspection.archiveDigest, retained.digest, 'Stage inspection archive differs');
  if (inspection.runtimeVersion !== undefined) assert.equal(inspection.runtimeVersion, lock.version, 'Stage inspection runtime version differs');
  return { archive: { ...staged.archive, digest: retained.digest }, evidence: {
    sha256Source: staged.archive.digest === undefined ? 'bounded-retained-copy-hash' : 'staging-owner-and-bounded-retained-copy-hash',
    sha512Source: 'existing-staging-and-inspection-owner', treeAndLock: 'existing-inspection-owner',
    inspectorArchiveDigest: inspection.archiveDigest ?? null, inspectorRuntimeVersion: inspection.runtimeVersion ?? null } };
}

/** Hash caller bytes without admitting special files or unbounded reads before the staging owner. */
export function contextArchiveDescriptor(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK), maximumBytes = 512 * 1024 * 1024;
  try {
    const before = fstatSync(fd, { bigint: true });
    assert.ok(before.isFile() && before.size > 0n && before.size <= BigInt(maximumBytes), 'Archive must be a bounded ordinary file');
    const identity = createHash('sha256'), integrity = createHash('sha512'), buffer = Buffer.alloc(64 * 1024);
    let bytes = 0, length;
    while ((length = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      bytes += length; assert.ok(bytes <= maximumBytes, 'Archive exceeded its byte limit during capture');
      const chunk = buffer.subarray(0, length); identity.update(chunk); integrity.update(chunk);
    }
    const after = fstatSync(fd, { bigint: true });
    assert.ok(before.size === BigInt(bytes) && before.size === after.size && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs,
      'Archive changed during descriptor capture');
    return { digest: `sha256:${identity.digest('hex')}`, integrity: `sha512-${integrity.digest('base64')}` };
  } finally { closeSync(fd); }
}

/** Explicit --live is caller authorization. No credentials appear in arguments, fixtures or reports. */
export async function verifyContextQuality({ packageRoot, archive, archiveDigest, baselinePackageRoot, baselineArchive, baselineArchiveDigest,
  output, live = false, caseIds, freezeOnly = false }) {
  const directory = outsideCheckout(output), suite = freezeContextQualitySuite(), suitePath = join(directory, 'frozen-suite.json');
  if (existsSync(suitePath)) assert.equal(JSON.parse(readFileSync(suitePath, 'utf8')).suiteDigest, suite.suiteDigest, 'Existing frozen suite differs');
  else writeJson(suitePath, suite);
  if (freezeOnly) return { status: 'frozen', suiteDigest: suite.suiteDigest, cases: suite.cases.map(item => item.id), reservedHoldout: suite.reservedHoldout, suitePath };
  assert.ok(archive, 'Supply --archive=<candidate-runtime.tgz> before execution');
  assert.equal(Boolean(baselinePackageRoot), Boolean(baselineArchive), 'Baseline package and exact archive must be supplied together');
  assert.ok(baselineArchive || baselineArchiveDigest === undefined, 'Baseline archive digest needs an explicit baseline archive');
  if (live && !process.env.JEV_TOKEN) throw new Error('Live verification needs caller-owned JEV_TOKEN in the environment');
  const selected = caseIds ? suite.cases.filter(item => caseIds.includes(item.id)) : suite.cases.filter(item => item.split !== 'holdout');
  if (!selected.length || caseIds?.some(id => !suite.cases.some(item => item.id === id))) throw new Error('Unknown or empty frozen case selection');
  const candidateStage = await stageContextQualityArchive({ packageRoot, archive, archiveDigest, stagingRoot: join(directory, 'runtimes/candidate') });
  const candidate = candidateStage.identity, packages = [{ condition: 'candidate', ...candidateStage }];
  if (baselinePackageRoot) packages.push({ condition: 'baseline', ...await stageContextQualityArchive({ packageRoot: baselinePackageRoot,
    archive: baselineArchive, archiveDigest: baselineArchiveDigest, stagingRoot: join(directory, 'runtimes/baseline') }) });
  const scorerPath = join(candidate.root, 'dist/engine/src/context-evaluation-quality.js');
  assert.ok(existsSync(scorerPath), 'The staged candidate lacks the quality scoring owner');
  const quality = await import(pathToFileURL(scorerPath).href);
  for (const name of ['contextQualityLabelDigest', 'scoreContextQuality']) assert.equal(typeof quality[name], 'function', `The staged candidate lacks ${name}`);
  const rows = [];
  for (const { condition, identity, inspect } of packages) for (const arm of ['deterministic', 'jev']) for (const fixture of selected) {
    inspect();
    const trial = join(directory, condition, arm, fixture.id);
    assert.equal(existsSync(trial), false, 'Use a fresh output directory for each execution');
    const repo = join(trial, 'repo'), state = join(trial, 'state'), callsPath = join(trial, 'calls.jsonl'), preload = join(trial, 'transport.mjs');
    mkdirSync(repo, { recursive: true }); mkdirSync(state);
    for (const item of fixture.labels.sources) {
      if (fixture.conditions.unavailableSources.includes(item.candidateId)) continue;
      const path = join(repo, item.candidateId); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, item.text);
    }
    writeJson(join(repo, 'config/governance/profile.yaml'), profileFor(fixture, arm));
    writeJson(join(repo, 'config/governance/facts.lock.yaml'), { profile_id: 'synthetic-context-quality', facts: {} });
    const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
    git('init'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Freeze synthetic quality sources');
    writeFileSync(preload, `import {appendFileSync} from 'node:fs';\nconst fixtureReply=${contextQualityFixtureReply.toString()};\nconst fetchOriginal=globalThis.fetch;let sequence=0;\nglobalThis.fetch=async(url,init)=>{\n if(String(url)!==${JSON.stringify(ENDPOINT)}) throw Error('Unexpected verification network destination');\n const request=JSON.parse(init.body),id=sequence++;\n const record={id,request,response:null};\n appendFileSync(${JSON.stringify(callsPath)},JSON.stringify({event:'dispatch',id,request})+'\\n');\n const response=${live ? "await fetchOriginal(url,init)" : "Response.json(fixtureReply(request))"};\n try{record.response=await response.clone().json();}catch{}\n appendFileSync(${JSON.stringify(callsPath)},JSON.stringify({event:'complete',...record})+'\\n');\n return response;\n};\n`);
    const environment = { ...process.env, XDG_STATE_HOME: state, JEV_TOKEN: live ? process.env.JEV_TOKEN : 'fixture-only' };
    for (const key of Object.keys(environment)) if (key.startsWith('GOVERNANCE_GENERATION_') || ['GOVERNANCE_SESSION_ID', 'HARNESS_SESSION', 'CODEX_THREAD_ID'].includes(key)) delete environment[key];
    if (arm === 'deterministic') delete environment.JEV_TOKEN;
    const args = ['context-route', '--task', fixture.request.purpose, '--revision', fixture.request.taskRevision,
      '--decision-task', `synthetic-quality-${fixture.id}`, '--json'];
    const questionIdentity = await selectionQuestionIdentity(identity.root);
    writeJson(join(trial, 'condition.json'), { package: identity, questionIdentity, arm, trialNumber: 1, transport: live && arm === 'jev' ? 'live' : 'controlled',
      frozenSuiteDigest: suite.suiteDigest, frozenCaseDigest: fixture.caseDigest, args, profileDigest: digest(profileFor(fixture, arm)) });
    const result = spawnSync(process.execPath, ['--import', preload, identity.launcher, ...args], { cwd: repo, env: environment,
      encoding: 'utf8', timeout: 60000, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024 });
    const events = existsSync(callsPath) ? readFileSync(callsPath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
    const dispatches = events.filter(item => item.event === 'dispatch'), completions = events.filter(item => item.event === 'complete');
    const calls = dispatches.map(item => ({ request: item.request, response: completions.find(value => value.id === item.id)?.response ?? null, id: item.id }));
    writeFileSync(join(trial, 'route.stdout.json'), result.stdout ?? '', { mode: 0o600 });
    let row = { condition, arm, caseId: fixture.id, split: fixture.split, package: identity, questionIdentity, trialNumber: 1, provider: live && arm === 'jev' ? 'live' : 'controlled',
      exitCode: result.status, actualCalls: calls.length, failedCalls: calls.filter(item => !item.response).length, error: result.error?.code ?? null,
      stderrDigest: rawDigest(result.stderr ?? ''), trial };
    try {
      const route = JSON.parse(result.stdout), receiptPath = join(state, 'project-governance/context', digest(realpathSync(repo)).slice(7), 'routes', `${route.receiptId}.json`);
      const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
      const decisionIds = [...new Set([...(receipt.metadata?.decisions ?? []).map(item => item.receiptId), ...(receipt.selection?.passageAdvice?.receiptIds ?? [])].filter(Boolean))];
      const decisionEvidence = decisionIds.map(id => {
        assert.match(id, /^[a-z0-9-]{1,128}$/u, 'Invalid decision receipt ID');
        const path = join(dirname(dirname(receiptPath)), 'decisions', `${id}.json`);
        if (!existsSync(path)) return { id, status: 'unavailable' };
        const bytes = readFileSync(path), record = JSON.parse(bytes);
        assert.equal(record.receiptId, id, 'Decision receipt identity differs');
        assert.equal(record.outcome?.scope?.workspace, repo, 'Decision receipt workspace differs');
        assert.equal(record.outcome?.scope?.taskRevision, fixture.request.taskRevision, 'Decision receipt revision differs');
        const observed = calls.find(item => digest(item.request) === record.outcome.payloadDigest);
        if (observed) observed.outcome = record.outcome;
        return { id, status: 'verified', path, digest: rawDigest(bytes), payloadDigest: record.outcome.payloadDigest,
          providerCalled: record.outcome.providerCalled, reason: record.outcome.reason, usage: record.outcome.usage };
      });
      const assessment = assessContextRoute(fixture, route, receipt, calls, quality);
      if (arm === 'deterministic' && calls.length) assessment.integrityFailures.push('deterministic-arm-dispatched-provider');
      row = { ...row, ready: route.ready, receiptPath, receiptDigest: rawDigest(readFileSync(receiptPath)), decisionEvidence, ...assessment,
        semanticStatus: assessment.semanticFailures.length ? 'failed' : 'passed',
        fullChainStatus: arm === 'deterministic' ? 'local-arm' : assessment.metadataCalls > 0 && assessment.passageCalls > 0 &&
          assessment.score.boundaries.find(item => item.stage === 'inventory').observed !== null ? 'observed' : 'partial-or-unavailable',
        integrationStatus: result.status === 0 && !assessment.integrityFailures.length ? 'passed' : 'failed' };
    } catch (error) {
      row = { ...row, integrationStatus: 'unavailable', semanticStatus: 'unavailable', assessmentError: error instanceof Error ? error.message : 'Unknown assessment failure',
        score: null, semanticFailures: null, integrityFailures: null };
    }
    writeJson(join(trial, 'assessment.json'), row); rows.push(row);
  }
  const runtimeStages = packages.map(({ condition, identity, inspect }) => ({ condition, identity, finalInspection: inspect() }));
  const report = { version: 1, status: rows.every(item => item.integrationStatus === 'passed') ? 'passed' : 'partial', suiteDigest: suite.suiteDigest,
    semanticStatus: rows.some(item => item.semanticStatus === 'failed') ? 'failed' : rows.every(item => item.semanticStatus === 'passed') ? 'passed' : 'unavailable',
    assignedTrials: 1, selectedCases: selected.map(item => ({ id: item.id, split: item.split, caseDigest: item.caseDigest })),
    frozenSuite: suitePath, provider: live ? 'live-environment-token' : 'controlled-no-external-transport', reservedHoldout: suite.reservedHoldout,
    runtimeStages, scoringOwner: { packageVersion: candidate.version, archiveDigest: candidate.archive.digest, moduleDigest: rawDigest(readFileSync(scorerPath)) },
    rows, comparisons: selected.flatMap(fixture => packages.map(({ condition }) => {
      const arms = rows.filter(item => item.caseId === fixture.id && item.condition === condition);
      const get = arm => arms.find(item => item.arm === arm)?.score?.essentialGroups.completeDelivered ?? null;
      return { caseId: fixture.id, condition, deterministicComplete: get('deterministic'), jevComplete: get('jev'),
        delta: get('deterministic') !== null && get('jev') !== null ? get('jev') - get('deterministic') : null };
    })), claims: { installedRoute: 'measured-per-row', semanticSuccess: 'per-case-frozen-quality-score-only',
      shortResume: 'explicit-short-prompt-proxy; native-same-session-resume-not-exercised', steering: 'explicit-current-request-proxy',
      mixedStatus: 'source-selection-proxy; read-only-bound-task-facts-qualified-separately',
      holdoutUse: 'only-explicit-case-selection; not-question-tuning-input',
      hostConsumption: 'unknown', acceptedTaskOutcome: 'unknown', totalTaskTokens: null, savingsQualified: false,
      evidenceRetention: 'retained-in-caller-external-proof-directory', liveCalls: live ? rows.reduce((sum, item) => sum + item.actualCalls, 0) : 0 } };
  const reportPath = join(directory, 'context-quality.json'); writeJson(reportPath, report);
  return { ...report, reportPath };
}

/** Offline presentation proof reuses the original calls and frozen labels; it admits no native entry. */
export async function renderContextQualityReport({ renderReport, output }) {
  const sourceReportPath = realpathSync(resolve(renderReport)), reportBytes = readFileSync(sourceReportPath), original = JSON.parse(reportBytes);
  const directory = outsideCheckout(output), reportPath = join(directory, 'context-quality-rendered.json');
  assert.equal(existsSync(reportPath), false, 'Use a fresh rendering report output');
  const suiteBytes = readFileSync(original.frozenSuite), suite = JSON.parse(suiteBytes), { suiteDigest, ...suiteBody } = suite;
  assert.equal(suiteDigest, digest(suiteBody), 'Retained frozen suite identity differs');
  assert.deepEqual(suite, freezeContextQualitySuite(), 'Retained suite differs from the unchanged frozen labels and conditions');
  assert.equal(original.suiteDigest, suiteDigest); assert.equal(original.assignedTrials, 1);
  const selected = original.selectedCases.map(item => {
    const fixture = suite.cases.find(value => value.id === item.id);
    assert.ok(fixture && fixture.split === item.split && fixture.caseDigest === item.caseDigest, 'Retained case selection differs');
    return fixture;
  });
  assert.equal(new Set(selected.map(item => item.id)).size, selected.length, 'Retained selected cases repeat');
  assert.ok(selected.length && original.runtimeStages.length, 'Retained report has no cases or runtime stages');
  assert.equal(new Set(original.runtimeStages.map(item => item.condition)).size, original.runtimeStages.length, 'Retained runtime conditions repeat');
  assert.equal(original.rows.length, selected.length * original.runtimeStages.length * 2, 'Retained row population differs');
  const seen = new Set(), originals = new Map([[sourceReportPath, rawDigest(reportBytes)], [original.frozenSuite, rawDigest(suiteBytes)]]);
  const readOriginal = path => {
    const bytes = readFileSync(path), hash = rawDigest(bytes);
    if (originals.has(path)) assert.equal(hash, originals.get(path), 'Retained original changed during rendering');
    originals.set(path, hash); return bytes;
  };
  // Even an accidental future provider dispatch must fail in this offline lane.
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Offline native rendering cannot dispatch a provider'); };
  try {
    const owners = new Map();
    for (const stage of original.runtimeStages) {
      const identity = stage.identity, installationBytes = readOriginal(identity.stage.receiptPath), staged = JSON.parse(installationBytes);
      assert.equal(rawDigest(installationBytes), identity.stage.receiptDigest, 'Retained installation receipt differs');
      const currentPackage = packageIdentity(identity.root);
      for (const key of Object.keys(currentPackage)) assert.equal(currentPackage[key], identity[key], 'Retained installed package identity differs');
      const { inspectRuntimeGeneration } = await import(pathToFileURL(join(identity.root, 'dist/engine/src/runtime-inspection.js')).href);
      const inspection = inspectRuntimeGeneration(identity.stage.directory);
      assert.deepEqual(inspection, stage.finalInspection, 'Retained installed runtime changed');
      assert.deepEqual(inspection, identity.stage.inspection, 'Original runtime inspection differs');
      const captured = contextArchiveDescriptor(identity.archive.path), retained = contextArchiveDescriptor(identity.archive.retainedPath);
      assert.equal(captured.digest, identity.archive.digest, 'Retained source archive differs');
      const qualification = qualifyContextArchiveStage({ staged, inspection, lock: staged.lock, captured, retained });
      assert.deepEqual(qualification.evidence, identity.stage.archiveQualification, 'Retained archive qualification differs');
      assert.equal(staged.lockDigest, identity.stage.lockDigest); assert.equal(staged.installedTree.digest, identity.stage.installedTreeDigest);
      const rendererPath = join(identity.root, 'dist/engine/src/prompt-context.js'), budgetPath = join(identity.root, 'dist/engine/src/prompt-context-budget.js');
      const renderer = await import(pathToFileURL(rendererPath).href), budget = await import(pathToFileURL(budgetPath).href);
      assert.equal(typeof renderer.renderPromptContext, 'function', 'Retained runtime lacks the native renderer');
      assert.equal(typeof budget.requiredPromptText, 'function'); assert.equal(typeof budget.promptPacketLimit, 'function');
      const factsPath = join(identity.root, 'dist/engine/src/task-facts.js');
      const facts = existsSync(factsPath) ? await import(pathToFileURL(factsPath).href) : null;
      if (facts) assert.equal(typeof facts.readTaskFacts, 'function', 'Retained facts reader differs');
      owners.set(stage.condition, { identity, renderer, budget, facts, inspectRuntimeGeneration, inspection,
        rendererPath, rendererDigest: rawDigest(readOriginal(rendererPath)), budgetDigest: rawDigest(readOriginal(budgetPath)),
        factsReaderDigest: facts ? rawDigest(readOriginal(factsPath)) : null });
    }
    const candidate = owners.get('candidate'); assert.ok(candidate, 'Retained scoring candidate is unavailable');
    const scorerPath = join(candidate.identity.root, 'dist/engine/src/context-evaluation-quality.js');
    assert.equal(rawDigest(readOriginal(scorerPath)), original.scoringOwner.moduleDigest, 'Retained scoring owner differs');
    assert.equal(candidate.identity.archive.digest, original.scoringOwner.archiveDigest);
    assert.equal(candidate.identity.version, original.scoringOwner.packageVersion);
    const quality = await import(pathToFileURL(scorerPath).href), rows = [];
    for (const row of original.rows) {
      const owner = owners.get(row.condition), fixture = selected.find(item => item.id === row.caseId);
      assert.ok(owner && fixture && ['deterministic', 'jev'].includes(row.arm), 'Retained row has no qualified condition');
      assert.deepEqual(row.package, owner.identity, 'Retained row runtime differs');
      assert.equal(row.integrationStatus, 'passed', 'Retained row originals are not qualified');
      const rowKey = `${row.condition}/${row.arm}/${row.caseId}`;
      assert.equal(seen.has(rowKey), false, 'Retained row repeats'); seen.add(rowKey);
      const condition = JSON.parse(readOriginal(join(row.trial, 'condition.json')));
      assert.deepEqual(condition.package, row.package); assert.deepEqual(condition.questionIdentity, row.questionIdentity);
      assert.equal(condition.frozenSuiteDigest, suiteDigest); assert.equal(condition.frozenCaseDigest, fixture.caseDigest);
      assert.equal(condition.arm, row.arm); assert.equal(condition.trialNumber, row.trialNumber); assert.equal(row.trialNumber, 1);
      assert.equal(condition.profileDigest, digest(profileFor(fixture, row.arm)), 'Retained profile differs');
      assert.deepEqual(await selectionQuestionIdentity(owner.identity.root), row.questionIdentity, 'Retained question owner differs');
      const route = JSON.parse(readOriginal(join(row.trial, 'route.stdout.json'))), receiptBytes = readOriginal(row.receiptPath), receipt = JSON.parse(receiptBytes);
      assert.equal(rawDigest(receiptBytes), row.receiptDigest, 'Retained route receipt differs');
      assert.equal(receipt.workspace, realpathSync(join(row.trial, 'repo'))); assert.equal(route.execution.workspace, receipt.workspace);
      assert.deepEqual(route.route.budget, receipt.contextBudget); assert.deepEqual(route.route.budgetAuthority, receipt.contextBudgetAuthority);
      assert.equal(route.ready, receipt.ready); assert.deepEqual(route.execution, receipt.execution);
      const callsPath = join(row.trial, 'calls.jsonl'), events = existsSync(callsPath) ? readOriginal(callsPath).toString('utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
      const dispatches = events.filter(item => item.event === 'dispatch'), completions = events.filter(item => item.event === 'complete');
      assert.equal(new Set(dispatches.map(item => item.id)).size, dispatches.length, 'Retained dispatch IDs repeat');
      assert.equal(new Set(completions.map(item => item.id)).size, completions.length, 'Retained completion IDs repeat');
      assert.ok(completions.every(item => dispatches.some(value => value.id === item.id)), 'Retained completion lacks a dispatch');
      const calls = dispatches.map(item => {
        const completion = completions.find(value => value.id === item.id);
        if (completion) assert.deepEqual(completion.request, item.request, 'Retained dispatch and completion payload differ');
        return { id: item.id, request: item.request, response: completion?.response ?? null };
      });
      assert.equal(calls.length, row.actualCalls, 'Retained provider call population differs');
      assert.equal(calls.filter(item => !item.response).length, row.failedCalls);
      if (row.arm === 'deterministic') assert.equal(calls.length, 0);
      for (const evidence of row.decisionEvidence ?? []) {
        assert.equal(evidence.status, 'verified', 'Retained decision evidence is unavailable');
        const bytes = readOriginal(evidence.path), decision = JSON.parse(bytes);
        assert.equal(rawDigest(bytes), evidence.digest, 'Retained decision receipt differs'); assert.equal(decision.receiptId, evidence.id);
        assert.equal(decision.outcome.scope.workspace, receipt.workspace); assert.equal(decision.outcome.scope.taskRevision, fixture.request.taskRevision);
        assert.equal(decision.outcome.payloadDigest, evidence.payloadDigest);
        for (const call of calls.filter(item => digest(item.request) === decision.outcome.payloadDigest)) call.outcome = decision.outcome;
      }
      const routeAssessment = assessContextRoute(fixture, route, receipt, calls, quality);
      for (const key of ['score', 'stages', 'decisiveSpans', 'disclosure', 'semanticFailures', 'integrityFailures', 'actualCalls'])
        assert.deepEqual(routeAssessment[key], row[key], `Retained route assessment differs: ${key}`);
      const entryId = digest({ lane: 'offline-presentation-only', suiteDigest, rowKey, receiptId: route.receiptId }).slice(7);
      let facts = route.taskFacts ?? undefined, factsCondition = facts ? 'captured-route-taskFacts' : 'not-supported-by-this-installed-generation';
      if (!facts && owner.facts) {
        facts = owner.facts.readTaskFacts(receipt.workspace, `offline-render-${fixture.id}`, { qualifyHistoricalChecks: false });
        assert.ok(facts.association.status !== 'associated' && facts.association.status !== 'historical-bound-revision', 'Offline presentation session unexpectedly has a task binding');
        factsCondition = 'installed-read-only-unbound-snapshot; synthetic-presentation-session';
      }
      const history = { state: 'unavailable', candidates: [], inspected: 0, omissions: [] }, nativeNotice = '';
      const rendered = owner.renderer.renderPromptContext(route, history, entryId, nativeNotice, facts);
      const requiredText = owner.budget.requiredPromptText(route.entries, route.skills?.entries ?? [], entryId, route.receiptId).text;
      const packetLimitBytes = owner.budget.promptPacketLimit(route.route.budget, route.route.budgetAuthority?.nativePacketBytes);
      const assessment = assessRenderedContext(fixture, route, receipt, calls, { rendered, requiredText, packetLimitBytes }, quality);
      writeFileSync(join(directory, `${row.condition}-${row.arm}-${fixture.id}.txt`), rendered.text, { mode: 0o600 });
      rows.push({ condition: row.condition, arm: row.arm, caseId: row.caseId, split: row.split, archiveDigest: owner.identity.archive.digest,
        rendererDigest: owner.rendererDigest, budgetDigest: owner.budgetDigest, factsReaderDigest: owner.factsReaderDigest,
        conditions: { history: 'explicit-empty-history', nativeNotice: 'explicit-empty-notice', facts: factsCondition, factsSnapshot: facts ?? null,
          entryId, entryIdentity: 'synthetic-presentation-only; not-admitted-or-replayable', boundHostEvent: 'not-exercised' },
        ...assessment, semanticStatus: assessment.semanticFailures.length ? 'failed' : 'passed',
        integrityStatus: assessment.integrityFailures.length ? 'failed' : 'passed' });
    }
    for (const owner of owners.values()) assert.deepEqual(owner.inspectRuntimeGeneration(owner.identity.stage.directory), owner.inspection, 'Installed owner changed during offline rendering');
    for (const [path, hash] of originals) assert.equal(rawDigest(readFileSync(path)), hash, 'Retained original changed during offline rendering');
    const report = { version: 1, status: rows.every(row => row.integrityStatus === 'passed') ? 'passed' : 'partial',
      sourceReportPath, sourceReportDigest: rawDigest(reportBytes), suiteDigest, providerCallsTriggered: 0,
      retainedProviderCalls: original.rows.reduce((sum, row) => sum + row.actualCalls, 0), originalsChanged: false,
      assessmentOwnerDigest: rawDigest(readFileSync(fileURLToPath(import.meta.url))),
      originals: [...originals].map(([path, hash]) => ({ path, digest: hash })), rows,
      claims: { scope: 'offline-exact-installed-native-rendering-with-frozen-selection-originals',
        finalRenderedPacket: 'measured-per-row-after-native-envelope-and-framing', hostDelivery: 'unknown', hostConsumption: 'unknown',
        acceptedTaskOutcome: 'unknown', totalTaskTokens: null, savingsQualified: false, nativeSessionContinuation: 'qualified-separately',
        differingInstalledFactsSupport: 'explicit-per-row; not-a-matched-facts-comparison' } };
    writeJson(reportPath, report); return { ...report, reportPath };
  } finally { globalThis.fetch = fetchOriginal; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arguments_ = process.argv.slice(2), value = key => arguments_.find(item => item.startsWith(`--${key}=`))?.slice(key.length + 3);
  const allowed = new Set(['--live', '--freeze-only']);
  if (arguments_.some(item => !allowed.has(item) && !/^--(?:package|archive|archive-digest|baseline-package|baseline-archive|baseline-archive-digest|output|case|render-report)=.+$/u.test(item))) throw new Error('Unknown verification argument');
  if (!value('output')) throw new Error('Supply --output=<external-proof-directory>');
  if (value('render-report')) assert.ok(arguments_.every(item => /^--(?:render-report|output)=.+$/u.test(item)), 'Offline rendering cannot combine execution arguments');
  const result = value('render-report') ? await renderContextQualityReport({ renderReport: value('render-report'), output: value('output') }) : await verifyContextQuality({ packageRoot: value('package') ?? process.cwd(), archive: value('archive'), archiveDigest: value('archive-digest'),
    baselinePackageRoot: value('baseline-package'), baselineArchive: value('baseline-archive'), baselineArchiveDigest: value('baseline-archive-digest'),
    output: value('output'), live: arguments_.includes('--live'), freezeOnly: arguments_.includes('--freeze-only'),
    caseIds: arguments_.filter(item => item.startsWith('--case=')).map(item => item.slice(7)).length ? arguments_.filter(item => item.startsWith('--case=')).map(item => item.slice(7)) : undefined });
  console.log(JSON.stringify({ status: result.status, suiteDigest: result.suiteDigest, reportPath: result.reportPath ?? result.suitePath,
    rows: result.rows?.length ?? 0, actualCalls: result.providerCallsTriggered ?? result.rows?.reduce((sum, item) => sum + item.actualCalls, 0) ?? 0,
    semanticFailures: result.rows?.filter(item => item.semanticFailures?.length).map(item => ({ condition: item.condition, arm: item.arm, caseId: item.caseId, failures: item.semanticFailures })) ?? [] }));
  process.exitCode = ['passed', 'frozen'].includes(result.status) ? 0 : 1;
}
