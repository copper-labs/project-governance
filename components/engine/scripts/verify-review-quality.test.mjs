import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildReviewQualitySuite, validateReviewQualitySuite, scoreReviewQuality, REVIEW_QUALITY_QUESTIONS,
  permuteReviewPayload, validateReviewPermutation, compareReviewOrderDistributions } from './verify-review-quality.mjs';
import { durableJson, fileDigest } from '../src/core.ts';
import { decisionOutcomeReport } from '../src/decision-outcomes.ts';
import { readReleaseEvaluation } from '../src/release-evaluation.ts';

const identity = value => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
test('order permutation retains meaning, rejects removed or mislabeled criteria and compares every distribution by ID', () => {
  const original = { model: 'fixture', state: { consumers: ['DL01', 'DL02'] }, questions: {
    q1: { type: 'noul', description: { question: 'Would this assertion fail on regression?', evidence: [{ text: 'Same frozen source and task', trust: 'untrusted' }] } },
    q2: { type: 'choice', description: { question: 'Does this change support the task?' }, criteria: {
      supported: { evidence: 'supported' }, partial: { evidence: 'partial' }, contradicted: { evidence: 'contradicted' },
      unknown: { evidence: 'No supplied candidate is supported by this evidence, or the evidence is insufficient.' } } },
  } };
  const permuted = permuteReviewPayload(original);
  assert.deepEqual(Object.keys(permuted.questions), ['q2', 'q1']);
  assert.deepEqual(Object.keys(permuted.questions.q2.criteria), ['unknown', 'contradicted', 'partial', 'supported']);
  validateReviewPermutation(original, permuted);
  assert.notEqual(JSON.stringify(original), JSON.stringify(permuted));
  const missing = structuredClone(permuted); delete missing.questions.q2.criteria.unknown;
  assert.throws(() => validateReviewPermutation(original, missing), /meaning/);
  const mislabeled = structuredClone(permuted); mislabeled.questions.q2.criteria.supported.evidence = 'contradicted';
  assert.throws(() => validateReviewPermutation(original, mislabeled), /meaning/);
  const wrongOriginal = structuredClone(original); wrongOriginal.questions.q2.criteria.supported.evidence = 'contradicted';
  assert.throws(() => permuteReviewPayload(wrongOriginal), /mislabeled/);
  const removedOriginal = structuredClone(original); delete removedOriginal.questions.q2.criteria.partial;
  assert.throws(() => permuteReviewPayload(removedOriginal), /removed or invented/);
  const left = { answers: { q1: { status: 'answered', shape: 'noul', probability: 0.1 }, q2: { status: 'answered', shape: 'choice', choice: 'contradicted', probabilities: { supported: 0, partial: 0.1, contradicted: 0.8, unknown: 0.1 } } } };
  const right = { answers: { q1: { status: 'invalid', reason: 'fixture' }, q2: { status: 'unknown', native: { shape: 'choice', choice: 'unknown', probabilities: { unknown: 0.8, contradicted: 0.1, partial: 0.1, supported: 0 } } } } };
  const compared = compareReviewOrderDistributions({ preparedPayload: original, wirePayload: original }, { preparedPayload: original, wirePayload: permuted }, left, right);
  assert.equal(compared.intendedQuestions, 2); assert.equal(compared.questions.length, 2);
  assert.equal(compared.questions[0].permutedStatus, 'invalid'); assert.equal(compared.questions[0].probabilityDelta, null);
  assert.equal(compared.questions[1].permutedChoice, 'unknown');
  assert.equal(compared.questions[1].criteria.find(item => item.id === 'unknown').delta, 0.7000000000000001);
  assert.equal(compared.questions[1].criteria.find(item => item.id === 'supported').delta, 0);
  assert.throws(() => compareReviewOrderDistributions({ preparedPayload: original, wirePayload: original }, { preparedPayload: original, wirePayload: original }, left, right), /not reversed/);
  const suite = buildReviewQualitySuite(), registered = observation(suite, 'weakened'), reordered = structuredClone(registered);
  reordered.orderCondition = 'permuted';
  assert.equal(scoreReviewQuality(suite, [registered, reordered]).conflictingCaptures, 0);
  assert.equal(scoreReviewQuality(suite, [registered, reordered], 'batched', 'permuted').captured, 4);
});
function observation(suite, kind, answer = 'oracle', mode = 'batched') {
  const cases = suite.cases.filter(item => item.kind === kind), enabled = mode === 'batched' ? ['DL01', 'DL02'] : [mode === 'dl01' ? 'DL01' : 'DL02'];
  return { kind, mode, inputDigest: identity(cases.map(item => item.inputDigest)), labelDigest: identity(cases.map(item => item.labelDigest)),
    review: { coverage: { captured: 4, omitted: ['tests/unsupported.test.rs', 'tests/irrelevant.md'], unavailable: [], truncated: false, limits: ['Runtime behavior is not established by source capture'] },
      consumers: enabled.map(consumerId => {
        const assessments = cases.flatMap(item => REVIEW_QUALITY_QUESTIONS[consumerId].map(questionId => {
          const interpretation = answer === 'oracle' ? item.expected[questionId] : questionId.endsWith('requirement-support/1') ? 'unknown' : 'uncertain';
          return { path: item.path, questionId, interpretation, status: interpretation === 'unknown' ? 'unknown' : 'answered' };
        }));
        const findings = answer === 'oracle' ? assessments.filter(item => item.questionId === 'test.assertion-support/1' || item.questionId === 'diff.task-relevance/1' ? item.interpretation === 'negative'
          : item.questionId.endsWith('requirement-support/1') ? ['partial', 'contradicted'].includes(item.interpretation) : item.interpretation === 'positive') : [];
        return { consumerId, delivered: answer === 'oracle', assessments, findings };
      }) } };
}

test('frozen corpus covers five source-backed cases per stack and rejects changed labels or inputs', () => {
  const suite = buildReviewQualitySuite();
  assert.equal(suite.cases.length, 20); assert.equal(suite.cases.filter(item => item.intendedDefect).length, 8);
  for (const stack of new Set(suite.cases.map(item => item.stack))) {
    const cases = suite.cases.filter(item => item.stack === stack);
    assert.equal(cases.length, 5);
    assert.deepEqual(cases.find(item => item.kind === 'intentional-change').expected, cases.find(item => item.kind === 'real-behavior').expected);
    assert.equal(cases.find(item => item.kind === 'insufficient-setup').expected['test.requirement-support/1'], 'unknown');
  }
  const wrongSource = structuredClone(suite); wrongSource.cases[0].after += '// changed after freeze\n';
  assert.throws(() => validateReviewQualitySuite(wrongSource), /input identity differs/);
  const wrongLabels = structuredClone(suite); wrongLabels.cases[0].expected['test.assertion-support/1'] = 'negative';
  assert.throws(() => validateReviewQualitySuite(wrongLabels), /label identity differs/);
  const missing = structuredClone(suite); missing.cases.pop(); assert.throws(() => validateReviewQualitySuite(missing));
  const duplicate = structuredClone(suite); duplicate.cases[19] = duplicate.cases[0]; assert.throws(() => validateReviewQualitySuite(duplicate));
});

test('complete denominator retains omitted defects and separates unknown answers from semantic success', () => {
  const suite = buildReviewQualitySuite(), empty = scoreReviewQuality(suite, []);
  assert.equal(empty.totalCases, 20); assert.equal(empty.intendedQuestionCount, 120);
  assert.equal(empty.states.omitted, 120); assert.equal(empty.misses, 8); assert.equal(empty.conditionalMisses, 0);
  const kinds = [...new Set(suite.cases.map(item => item.kind))], unknown = kinds.map(kind => observation(suite, kind, 'unknown'));
  const report = scoreReviewQuality(suite, unknown);
  assert.equal(report.captured, 20); assert.equal(report.sufficientCaptures, 16);
  assert.equal(report.states.uncertain, 80); assert.equal(report.states.unknown, 40);
  assert.equal(report.misses, 8); assert.equal(report.conditionalMisses, 8); assert.equal(report.falseFindings, 0);
  assert.equal(Object.values(report.states).reduce((sum, value) => sum + value, 0), report.intendedQuestionCount);
  const ideal = scoreReviewQuality(suite, kinds.map(kind => observation(suite, kind)));
  assert.equal(ideal.deliveredDefects, 8); assert.equal(ideal.misses, 0); assert.equal(ideal.falseFindings, 0);
  const hostile = observation(suite, 'intentional-change');
  hostile.review.consumers[0].findings.push({ questionId: 'test.expectation-weakened/1', path: suite.cases.find(item => item.kind === 'intentional-change').path });
  assert.equal(scoreReviewQuality(suite, [hostile]).falseFindings, 1);
  const unsupported = observation(suite, 'insufficient-setup');
  unsupported.review.consumers[0].findings.push({ questionId: 'test.requirement-support/1', path: suite.cases.find(item => item.kind === 'insufficient-setup').path });
  assert.equal(scoreReviewQuality(suite, [unsupported]).unsupportedFindings, 1);
});

test('same capture cannot inflate findings and conflicting or mismatched repeats do not establish success', () => {
  const suite = buildReviewQualitySuite(), first = observation(suite, 'mock-only');
  const single = scoreReviewQuality(suite, [first]), repeated = scoreReviewQuality(suite, [first, structuredClone(first)]);
  assert.equal(repeated.repeatedCaptures, 1); assert.equal(repeated.totalCases, 20); assert.equal(repeated.usefulFindings, single.usefulFindings);
  const different = structuredClone(first); different.review.consumers[0].findings = [];
  const conflict = scoreReviewQuality(suite, [first, different]); assert.equal(conflict.conflictingCaptures, 1); assert.equal(conflict.deliveredDefects, 0);
  const wrongInput = structuredClone(first); wrongInput.inputDigest = `sha256:${'a'.repeat(64)}`;
  assert.throws(() => scoreReviewQuality(suite, [wrongInput]), /input identity differs/);
  const wrongLabel = structuredClone(first); wrongLabel.labelDigest = `sha256:${'a'.repeat(64)}`;
  assert.throws(() => scoreReviewQuality(suite, [wrongLabel]), /label identity differs/);
  assert.equal(scoreReviewQuality(suite, [], 'dl01').intendedQuestionCount, 80);
  const dl02 = scoreReviewQuality(suite, [], 'dl02');
  assert.equal(dl02.intendedQuestionCount, 40); assert.equal(dl02.intendedDefects, 8); assert.equal(dl02.misses, 8);
});

test('JS/TS behavior witness fails with the concrete fault, while mocked and weakened tests let that fault pass', () => {
  const suite = buildReviewQualitySuite(), directory = realpathSync(mkdtempSync(join(tmpdir(), 'review-quality-witness-')));
  let completed = false;
  try {
    const run = (label, source, expected) => {
      const path = join(directory, `${label}.test.ts`); writeFileSync(path, source);
      const environment = { ...process.env }; delete environment.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, ['--test', path], { encoding: 'utf8', timeout: 5000, env: environment });
      writeFileSync(join(directory, `${label}.stdout`), result.stdout ?? ''); writeFileSync(join(directory, `${label}.stderr`), result.stderr ?? '');
      assert.equal(result.status, expected, result.stdout + result.stderr);
      return result;
    };
    const entry = kind => suite.cases.find(item => item.stack === 'javascript-typescript' && item.kind === kind);
    run('real', entry('real-behavior').after, 0);
    const fault = entry('real-behavior').after.replace('rows.filter(row => row.owner !== owner)', '[]');
    const caught = run('fault', fault, 1); assert.match(caught.stdout, /release preserves required owners/);
    for (const kind of ['mock-only', 'weakened']) { assert.match(entry(kind).after, /return \[\]/); run(kind, entry(kind).after, 0); }
    run('intentional', entry('intentional-change').after, 0);
    const missing = run('insufficient', entry('insufficient-setup').after, 1); assert.match(missing.stderr + missing.stdout, /unprovided-fixture/);
    completed = true;
  } finally {
    if (completed) rmSync(directory, { recursive: true, force: true });
    else console.error(`Behavior witness failure evidence retained: ${directory}`);
  }
});

test('existing outcome and release evaluators own repeated receipt and reservation cost accounting', () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'review-quality-accounting-'))), sha = `sha256:${'a'.repeat(64)}`;
  try {
    const write = (name, value) => { const path = join(directory, name); durableJson(path, value); return { path, digest: fileDigest(path) }; };
    const scope = { workspace: directory, taskId: 'fixture', taskRevision: '1' }, receiptId = 'b'.repeat(32);
    const decision = write('receipt.json', { version: 2, receiptId, runtimeVersion: 'fixture', outcome: { version: 2, scope, consumers: ['DL01', 'DL02'],
      mode: 'auto', delivered: true, reason: 'answered', providerCalled: true, model: 'fixture', latencyMs: 1,
      budget: { reservationId: 'c'.repeat(32) }, usage: { inputTokens: 100, outputTokens: 10 } } });
    const makeEpisode = id => ({ id, scope, decisions: [receiptId, receiptId], decisionEvidence: [{ receiptId, ...decision }],
      caller: write(`${id}-caller.json`, { version: 1, id, scope, entryKind: 'check-plan', native: { subjectDigest: sha, planDigest: sha }, decisionLinks: [{ receiptId }] }),
      native: [], labels: [], evaluation: { conditionId: 'offline', caseId: 'case', trialId: id, inputDigest: sha, expectedLabelDigest: sha,
        lifecycle: 'terminal', expected: [], evidence: [], providerJobs: [], usagePopulation: null } });
    const episode = makeEpisode('one'), manifest = write('manifest.json', { version: 2, episodes: [episode, makeEpisode('two'), episode], evaluation: {
      version: 1, metricContract: 'release-evaluation-1', suite: { version: 'fixture', digest: sha }, view: 'controlled',
      conditions: [{ id: 'offline', runtime: { version: 'fixture', archiveDigest: sha }, model: 'fixture', effort: null, cacheState: 'cold', arm: 'jev-active' }],
      population: { eligiblePrompts: 2 }, discovery: { scanComplete: true, projectionEvicted: 0 }, comparison: null } });
    const report = decisionOutcomeReport(directory, manifest.path);
    assert.equal(report.counts.selected, 3); assert.equal(report.counts.joined, 2); assert.equal(report.counts.duplicate_episodes, 1);
    assert.equal(report.counts.duplicate_decisions, 3); assert.equal(report.counts.duplicate_reservations, 1);
    const release = readReleaseEvaluation(directory, manifest.path);
    assert.equal(release.allArmSpending.knownSubtotalTokens, 110);
    assert.equal(release.allArmSpending.measurements, 1);
    assert.deepEqual(readReleaseEvaluation(directory, manifest.path), release);
    assert.equal(readFileSync(decision.path, 'utf8').includes('reservationId'), true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
