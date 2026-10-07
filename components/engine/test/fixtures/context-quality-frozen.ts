import { digest } from "../../src/core.ts";
import type { ContextEvaluationCase } from "../../src/context-evaluation.ts";
import { contextQualityLabelDigest, qualitySourceDigest, type ContextQualityLabels, type ContextQualitySource, type ContextQualityUnit } from "../../src/context-evaluation-quality.ts";

/** Authored source-backed expectations are separate from the selector and never sent to it. */
const source = (candidateId: string, text: string, permission: ContextQualitySource["bodyPermission"] = "permitted"): ContextQualitySource => ({
  candidateId, text, sourceDigest: qualitySourceDigest(text), bodyPermission: permission, exclusionReason: permission === "excluded" ? "local-body-scope-denied" : null,
});
const unit = (id: string, input: ContextQualitySource, firstLine: number, lastLine: number, relevance: ContextQualityUnit["relevance"]): ContextQualityUnit => ({
  id, candidateId: input.candidateId, firstLine, lastLine, rangeDigest: qualitySourceDigest((input.text.match(/[^\n]*\n|[^\n]+$/gu) ?? []).slice(firstLine - 1, lastLine).join("")), relevance,
});
const fixture = (id: string, purpose: string, sources: ContextQualitySource[], units: ContextQualityUnit[],
  essentialGroups: ContextQualityLabels["essentialGroups"], options: { required?: string[]; noMatch?: boolean; maximumBytes?: number; optionalExcerptBytes?: number; holdout?: boolean; suiteVersion?: string } = {}): ContextEvaluationCase => {
  const candidates = sources.filter(item => item.bodyPermission !== "excluded").map(item => ({ id: item.candidateId, sourceDigest: item.sourceDigest, excerpt: item.text }));
  const request = { taskRevision: `${id}-current`, purpose, maximumBytes: options.maximumBytes ?? 20_000,
    ...(options.optionalExcerptBytes ? { optionalExcerptBytes: options.optionalExcerptBytes } : {}),
    required: candidates.filter(item => options.required?.includes(item.id)), optional: candidates.filter(item => !options.required?.includes(item.id)) };
  const body: Omit<ContextQualityLabels, "labelDigest"> = { version: 1, suiteVersion: options.suiteVersion ?? (options.holdout ? "selection-quality-holdout-1" : "selection-quality-development-1"),
    inputDigest: digest(request), labelSource: { kind: "source-backed-fixture", reference: `synthetic-quality:${id}:authored-labels`, independentOfSelector: true },
    sources, units, essentialGroups, noMatch: options.noMatch ?? false, fullyLabeled: true };
  return { id, request, usefulOptionalIds: [...new Set(units.filter(item => item.relevance === "useful" && !options.required?.includes(item.candidateId)).map(item => item.candidateId))],
    qualityLabels: { ...body, labelDigest: contextQualityLabelDigest(body) } };
};

const owner = source("src/lease.ts", "export function style() {\n  return 'blue';\n}\nexport function release(lease) {\n  lease.owner = null;\n  lease.closed = true;\n}\n");
const support = source("src/retry.ts", "export function retry(status) {\n  return status === 'temporary';\n}\n");
const counter = source("test/retry.test.ts", "test('permanent denial stays denied', () => {\n  assert.equal(retry('denied'), false);\n});\n");
const weak = { ...source("src/converter.ts", "export function convert(value) {\n  return value * 1000;\n}\n"), description: { text: "Miscellaneous helpers", quality: "weak" as const } };
const checkpoint = source("docs/checkpoint.md", "# Current checkpoint\nCleanup remains uncertain.\nNext: verify the owned process exited.\n");
const stale = source("docs/previous.md", "# Previous objective\nChange the theme color.\n");
const required = source("AGENTS.md", "# Required instructions\nDo not publish without operator authorization.\nKeep cleanup uncertainty visible.\n");
const irrelevant = source("docs/theme.md", "# Theme guide\nUse a blue highlight.\n");
const denied = source("src/excluded.ts", "export function restrictedCondition() {\n  return 'decisive';\n}\n", "excluded");
const equivalent = source("docs/retry-contract.md", "# Retry contract\nOnly temporary status permits a retry.\n");

export const contextQualityDevelopment: ContextEvaluationCase[] = [
  fixture("right-path-wrong-passage", "Inspect release of an owned lease", [owner], [unit("style", owner, 1, 3, "irrelevant"), unit("release", owner, 4, 7, "useful")], [{ id: "lease-release", unitIds: ["release"], required: false }]),
  fixture("counter-evidence", "Check retry behavior and permanent denial", [support, counter], [unit("retry", support, 1, 3, "useful"), unit("denial", counter, 1, 3, "useful")],
    [{ id: "retry-rule", unitIds: ["retry"], required: false }, { id: "contrary-case", unitIds: ["denial"], required: false }]),
  fixture("weak-description", "Find unit conversion", [weak], [unit("conversion", weak, 1, 3, "useful")], [{ id: "conversion-rule", unitIds: ["conversion"], required: false }]),
  fixture("short-resume", "Continue", [checkpoint, stale], [unit("active-checkpoint", checkpoint, 1, 3, "useful"), unit("old-objective", stale, 1, 2, "irrelevant")], [{ id: "current-next-action", unitIds: ["active-checkpoint"], required: false }]),
  fixture("steering-multi-intent", "Now inspect cleanup and retry denial; the theme task is complete", [owner, counter, stale],
    [unit("old-style", owner, 1, 3, "irrelevant"), unit("new-cleanup", owner, 4, 7, "useful"), unit("new-denial", counter, 1, 3, "useful"), unit("previous-theme", stale, 1, 2, "irrelevant")],
    [{ id: "cleanup-intent", unitIds: ["new-cleanup"], required: false }, { id: "denial-intent", unitIds: ["new-denial"], required: false }]),
];

export const contextQualityHoldout: ContextEvaluationCase[] = [
  fixture("no-match", "Find a database migration", [irrelevant], [unit("theme-only", irrelevant, 1, 2, "irrelevant")], [], { noMatch: true, maximumBytes: 2, holdout: true }),
  fixture("permission-exclusion", "Find the decisive restricted condition", [denied, irrelevant], [unit("restricted", denied, 1, 3, "useful"), unit("unrelated", irrelevant, 1, 2, "irrelevant")],
    [{ id: "restricted-condition", unitIds: ["restricted"], required: false }], { holdout: true }),
  fixture("complete-required-evidence", "Inspect cleanup while preserving required instructions", [required, owner],
    [unit("instructions", required, 1, 3, "useful"), unit("other-style", owner, 1, 3, "irrelevant"), unit("required-release", owner, 4, 7, "useful")],
    [{ id: "mandatory-guidance", unitIds: ["instructions"], required: true }, { id: "cleanup-proof", unitIds: ["required-release"], required: false }], { required: ["AGENTS.md"], holdout: true }),
  fixture("equivalent-sources", "Find the retry rule", [support, equivalent], [unit("implementation", support, 1, 3, "useful"), unit("contract", equivalent, 1, 2, "useful")],
    [{ id: "one-retry-rule", unitIds: ["implementation", "contract"], required: false }], { holdout: true }),
];

/** 4.1 labels describe task needs before questions are tuned; no fixture copies adopter data. */
const clock = { ...source("src/value-helper.ts", "/** Miscellaneous helpers. */\nexport function scale(value: number): number {\n  return value * 1000;\n}\n"),
  description: { text: "Miscellaneous helpers.", quality: "weak" as const } };
const display = source("src/display-label.ts", "/** Labels for the workout timer. */\nexport function formatUnit() {\n  return 'milliseconds';\n}\n");
const reconnect = source("src/channel-policy.ts", "/** Decide whether a disconnected channel can be reopened. */\nexport function mayReconnect(reason: string) {\n  if (reason === 'credential-revoked') return false;\n  return reason === 'transport-reset';\n}\n");
const reconnectTest = source("test/channel-policy.test.ts", "import { mayReconnect } from '../src/channel-policy';\ntest('revoked credential never retries', () => {\n  assert.equal(mayReconnect('credential-revoked'), false);\n  assert.equal(mayReconnect('transport-reset'), true);\n});\n");
const peripheral = source("docs/device-reconnect.md", "# Reconnect procedure\nThis procedure reconnects a paired peripheral after a radio timeout.\nIt does not restore a server channel or renew credentials.\n");
const releaseLines = ["export async function releaseOwnedSession(session, active, journal) {\n",
  "  if (session.id !== active.id) {\n", "    journal.record('stale completion kept replacement alive', session.id);\n", "    return { released: false, reason: 'replacement-owns-session' };\n", "  }\n",
  "  if (session.releaseStarted) {\n", "    return { released: false, reason: 'release-already-started' };\n", "  }\n",
  "  session.releaseStarted = true;\n", "  try {\n", "    await session.pendingOutput;\n", "    await session.stopOwnedTransport();\n",
  "    journal.record('owned transport stopped before lock release', session.id);\n", "    return { released: true, reason: 'owned-transport-stopped' };\n",
  "  } finally {\n", "    if (active.id === session.id) active.lockOwner = null;\n", "    session.releaseFinished = true;\n", "  }\n", "}\n"];
const longPreamble = "export function decorativePalette() {\n" + Array.from({ length: 5200 }, (_, index) =>
  `  const decorativeShade${index} = 'unrelated screen color ${index}';\n`).join("") + "  return 'blue';\n}\n";
const longOwner = source("src/session-controller.ts", longPreamble + releaseLines.join(""));
const releaseStart = (longPreamble.match(/[^\n]*\n|[^\n]+$/gu) ?? []).length + 1;
const currentProgress = source("docs/current-progress.md", "# Session replacement checkpoint\nImplementation: replacement startup now keeps its own lock.\nExecuted verification: the replacement-start test passed.\nUnverified: a late callback from the old session may still clear that lock.\nNext recorded action: inspect closeCompletion and add the stale callback test.\nAcceptance: not recorded.\n");
const closeCompletion = source("src/close-completion.ts", "/** Finish the callback belonging to one session. */\nexport function closeCompletion(completed, active) {\n  active.lockOwner = null;\n  completed.finished = true;\n}\n");
const replacementCounter = source("test/replacement.test.ts", "test('old completion must preserve the replacement lock', () => {\n  const active = { id: 'replacement', lockOwner: 'replacement' };\n  closeCompletion({ id: 'old', finished: false }, active);\n  assert.equal(active.lockOwner, 'replacement');\n});\n");
const oldBackground = source("docs/color-checkpoint.md", "# Earlier color checkpoint\nThe theme update is complete.\nNext: publish the blue palette.\n");
const localContract = source("src/private-reservation.ts", "/** Synthetic local-only reservation contract. */\nexport function authorizeReservation(signedReceipt, reservation) {\n  return signedReceipt.owner === reservation.owner && signedReceipt.action === 'release';\n}\n");
const publicContract = source("docs/reservation-contract.md", "# Reservation release\nA release requires a signed receipt for the same owner and the release action.\nA receipt for another owner cannot release the reservation.\n");
const clientEnrollment = source("src/enrollment-panel.ts", "/** Render the enrollment page; the server endpoint is outside this repository. */\nexport function enrollmentTitle() {\n  return 'Enroll this device';\n}\n");
const palette = source("docs/palette.md", "# Color palette\nUse blue for the enrollment page title.\n");
const v41 = "selection-quality-4-1-development-1";
const v41Holdout = "selection-quality-4-1-holdout-1";
const complete = (input: ContextQualitySource, id: string, relevance: ContextQualityUnit["relevance"]) =>
  unit(id, input, 1, (input.text.match(/[^\n]*\n|[^\n]+$/gu) ?? []).length, relevance);
export const contextQuality41Development: ContextEvaluationCase[] = [
  fixture("4-1-weak-description", "Incoming event timestamps are in seconds but the sink expects milliseconds. Locate the conversion behavior, not just its display label.",
    [clock, display], [complete(clock, "seconds-to-milliseconds", "useful"), complete(display, "unit-label-only", "irrelevant")],
    [{ id: "timestamp-conversion", unitIds: ["seconds-to-milliseconds"], required: false }], { suiteVersion: v41, optionalExcerptBytes: 2048 }),
  fixture("4-1-near-match", "Review whether a revoked credential can reconnect the server channel. Find the guard and the test for that denial, not the peripheral reconnect procedure.",
    [reconnect, reconnectTest, peripheral], [complete(reconnect, "channel-retry-guard", "useful"), complete(reconnectTest, "channel-denial-assertions", "useful"), complete(peripheral, "peripheral-reconnect-only", "irrelevant")],
    [{ id: "channel-guard", unitIds: ["channel-retry-guard"], required: false }, { id: "channel-counter-evidence", unitIds: ["channel-denial-assertions"], required: false }],
    { suiteVersion: v41, optionalExcerptBytes: 2048 }),
  fixture("4-1-long-decisive-span", "Review whether owned session shutdown waits for pending output and preserves a replacement session's lock. Keep the complete shutdown rule so its cleanup condition is visible.",
    [longOwner], [unit("unrelated-palette-body", longOwner, 1, releaseStart - 1, "irrelevant"), unit("complete-owned-shutdown", longOwner, releaseStart, releaseStart + releaseLines.length - 1, "useful")],
    [{ id: "complete-shutdown-condition", unitIds: ["complete-owned-shutdown"], required: false }], { suiteVersion: v41, optionalExcerptBytes: 4096 }),
  fixture("4-1-mixed-status-fix", "Give me an update on session replacement, then fix the late close callback that clears the replacement lock.\nBound task intent (the current prompt may refine it):\nFinish session lifecycle work; the older color work is already complete.",
    [currentProgress, closeCompletion, replacementCounter, oldBackground], [complete(currentProgress, "current-progress-and-unknowns", "useful"), complete(closeCompletion, "late-close-owner", "useful"),
      complete(replacementCounter, "replacement-lock-assertion", "useful"), complete(oldBackground, "completed-color-background", "irrelevant")],
    [{ id: "current-status-evidence", unitIds: ["current-progress-and-unknowns"], required: false }, { id: "late-callback-rule", unitIds: ["late-close-owner"], required: false },
      { id: "replacement-counter-case", unitIds: ["replacement-lock-assertion"], required: false }], { suiteVersion: v41, optionalExcerptBytes: 2048 }),
  fixture("4-1-permission-separation", "Explain why a signed receipt for another owner must not release a reservation. Inspect the local-only implementation if provider sharing is denied; do not send its body or description.",
    [localContract, publicContract], [complete(localContract, "local-reservation-owner-rule", "useful"), complete(publicContract, "public-owner-contract", "useful")],
    [{ id: "reservation-owner-evidence", unitIds: ["local-reservation-owner-rule", "public-owner-contract"], required: false }], { suiteVersion: v41, optionalExcerptBytes: 2048 }),
  fixture("4-1-true-no-match", "Find the server implementation that issues and verifies enrollment one-time passcodes. A page title or enrollment color guide does not implement that server behavior.",
    [clientEnrollment, palette], [complete(clientEnrollment, "client-title-no-server", "irrelevant"), complete(palette, "enrollment-colors-no-server", "irrelevant")],
    [], { suiteVersion: v41, noMatch: true, optionalExcerptBytes: 2048 }),
];

const holdoutRationale = source("docs/cache-decision.md", "# Why cache snapshots are content-bound\nA pathname can be reused for different bytes.\nThe content digest prevents an old snapshot from being treated as the replacement.\nThe active execution owner decides when a new capture is allowed.\n");
const holdoutMutation = source("src/cache-reset.ts", "/** Reset the display preferences. */\nexport function resetCacheButton() { return 'Reset'; }\n");
const holdoutCode = source("src/repetition-state.kt", "/** Advance the same active repetition after an accepted sensor event. */\nfun advance(observed: Event, active: Session): Boolean {\n  if (observed.sessionId != active.id) return false\n  active.repetitions += 1\n  return true\n}\n");
const holdoutInstruction = source("docs/repetition-name.md", "# Repetition session\nThe screen calls a saved exercise list a session.\nThis guide changes naming only.\n");
const holdoutDenied = { ...source("src/local-export.ts", "/** Synthetic local export policy. */\nexport function canExport(request, owner) {\n  return request.ownerId === owner.id && owner.exportEnabled;\n}\n", "excluded"),
  exclusionReason: "upstream-resource-not-installed" };
const holdoutNoExport = source("docs/export-colors.md", "# Export button colors\nThe export button uses blue.\n");
const holdoutCheckpoint = source("docs/checkpoint.md", "# Restore checkpoint\nRecorded blocker: the schema owner has not approved the rename.\nImplementation is prepared; deployment and acceptance are not recorded.\nNext recorded action: obtain the schema decision before deployment.\n");
const holdoutDeploy = source("scripts/deploy.sh", "#!/usr/bin/env sh\n# Push a prepared artifact after release approval.\nexec deployment-tool push\n");
export const contextQuality41Holdout: ContextEvaluationCase[] = [
  fixture("4-1-holdout-rationale", "Explain why we bind a cache snapshot to its bytes. Do not change the cache reset button.\nBound task intent (the current prompt may refine it):\nReplace the preferences panel.",
    [holdoutRationale, holdoutMutation], [complete(holdoutRationale, "cache-identity-rationale", "useful"), complete(holdoutMutation, "reset-button-background", "irrelevant")],
    [{ id: "cache-design-reason", unitIds: ["cache-identity-rationale"], required: false }], { suiteVersion: v41Holdout, holdout: true, optionalExcerptBytes: 2048 }),
  fixture("4-1-holdout-native-guard", "Find the rule that prevents an event from a previous session from increasing the active repetition count.",
    [holdoutCode, holdoutInstruction], [complete(holdoutCode, "stale-native-event-guard", "useful"), complete(holdoutInstruction, "session-name-guide", "irrelevant")],
    [{ id: "native-event-owner-guard", unitIds: ["stale-native-event-guard"], required: false }], { suiteVersion: v41Holdout, holdout: true, optionalExcerptBytes: 2048 }),
  fixture("4-1-holdout-unavailable-resource", "Find the exact rule that authorizes export for the current owner.",
    [holdoutDenied, holdoutNoExport], [complete(holdoutDenied, "unavailable-export-rule", "useful"), complete(holdoutNoExport, "button-color-only", "irrelevant")],
    [{ id: "export-authorization", unitIds: ["unavailable-export-rule"], required: false }], { suiteVersion: v41Holdout, holdout: true, optionalExcerptBytes: 2048 }),
  fixture("4-1-holdout-current-blocker", "Tell me why we are waiting; do not deploy.\nBound task intent (the current prompt may refine it):\nPrepare and deploy the restore artifact.",
    [holdoutCheckpoint, holdoutDeploy], [complete(holdoutCheckpoint, "recorded-schema-blocker", "useful"), complete(holdoutDeploy, "deployment-background-only", "irrelevant")],
    [{ id: "current-recorded-blocker", unitIds: ["recorded-schema-blocker"], required: false }], { suiteVersion: v41Holdout, holdout: true, optionalExcerptBytes: 2048 }),
];

/** Sharing restrictions are fixture conditions, separate from local body eligibility in labels. */
export const contextQuality41Conditions: Record<string, { providerDenied?: string[]; unavailableSources?: string[] }> = {
  "4-1-permission-separation": { providerDenied: [localContract.candidateId] },
  "4-1-holdout-unavailable-resource": { providerDenied: [holdoutDenied.candidateId], unavailableSources: [holdoutDenied.candidateId] },
};

/** Separate representation labels leave the earlier development and holdout cases unchanged. */
const intervalTable = source("docs/interval-format.md", "# Interval storage\n| Source | Input unit | Stored unit |\n| --- | --- | --- |\n| Radio stream | milliseconds | seconds |\n| Browser export | seconds | milliseconds |\n");
export const contextQualityRepresentation: ContextEvaluationCase[] = [
  fixture("representation-table-units", "Confirm the unit returned by the radio interval reader from the storage contract. Distinguish the stored unit from the input unit; browser export does not define the radio contract.",
    [intervalTable], [unit("interval-heading", intervalTable, 1, 1, "useful"), unit("radio-row-with-columns", intervalTable, 2, 4, "useful"),
      unit("browser-row", intervalTable, 5, 5, "irrelevant")],
    [{ id: "radio-storage-columns", unitIds: ["radio-row-with-columns"], required: false }],
    { suiteVersion: "selection-quality-representation-1", optionalExcerptBytes: 2048 }),
];

/** Separate source-backed labels are frozen before semantic execution; earlier labels stay intact. */
const deepIntervalTable = source("docs/deep-interval-format.md", "# Interval contract\n| Source | Input unit | Stored unit |\n| --- | --- | --- |\n" +
  Array.from({ length: 36 }, (_, index) => `| unrelated channel ${index} | bytes | bytes |\n`).join("") +
  "| Radio stream | milliseconds | seconds |\n");
export const contextQualityRepresentation41: ContextEvaluationCase[] = [
  fixture("representation-deep-table-row", "Find the radio stream stored unit. Preserve the column meanings with the radio contract, without earlier unrelated channel rows.",
    [deepIntervalTable], [unit("deep-table-heading", deepIntervalTable, 1, 1, "irrelevant"),
      unit("deep-table-columns", deepIntervalTable, 2, 3, "useful"), unit("unrelated-channel-rows", deepIntervalTable, 4, 39, "irrelevant"),
      unit("deep-radio-row", deepIntervalTable, 40, 40, "useful")],
    [{ id: "radio-contract-columns", unitIds: ["deep-table-columns"], required: false },
      { id: "radio-contract-row", unitIds: ["deep-radio-row"], required: false }],
    { suiteVersion: "selection-quality-representation-2", optionalExcerptBytes: 260 }),
];
