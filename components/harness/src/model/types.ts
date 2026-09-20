/** Domain values are independent of SQLite and of any future continuity substrate. */
export type Provenance = "operator" | "observed" | "hypothesis";
export type TaskStatus = "open" | "needs-input" | "accepted" | "cancelled";
export type TaskMode = "implement" | "explore";
export type TaskItemKind = "constraint" | "acceptance" | "scope" | "open-question" | "ruled-out" | "handoff";
export interface TaskItem {
    seq: number;
    kind: TaskItemKind;
    provenance: Provenance;
    body: string;
    revoked: boolean;
    origin?: string | null;
}
export interface Task {
    taskId: string;
    version: number;
    supersedes: number | null;
    outcome: string;
    status: TaskStatus;
    items: TaskItem[];
    createdAt: string;
    worktree: string | null;
    branch: string | null;
    parentTask: string | null;
    parentVersion: number | null;
    parentCheckpoint: string | null;
    session: string | null;
    mode: TaskMode;
}
export type ActionStatus = "proposed" | "authorized" | "prepared" | "in-progress" | "completed" | "verified" | "refused" | "cancelled" | "outcome-unknown";
/** Checks may have side effects. These names describe intent, never an OS sandbox. */
export type Operation = "read" | "check" | "record";
export interface Action {
    actionId: string;
    taskId: string;
    taskVersion: number;
    operation: Operation;
    scope: string[];
    destination: string | null;
    policyRevision: string;
    status: ActionStatus;
    revision: number;
    expectedInputs: string[];
    intendedOutputs: string[];
    reconcile: string | null;
    refusedReason: string | null;
    createdAt: string;
    updatedAt: string;
}
export type ArtifactKind = "snapshot" | "patch" | "document" | "log" | "receipt";
export interface Artifact {
    artifactId: string;
    kind: ArtifactKind;
    subject: string | null;
    path: string | null;
    inline: string | null;
    bytes: number;
    provenance: Provenance;
    createdAt: string;
}
export type Confirmation = "confirmed" | "unconfirmed" | "refuted";
export type Criticality = "execution" | "analytics";
export interface Evidence {
    evidenceId: string;
    taskId: string | null;
    actionId: string | null;
    artifactId: string | null;
    claim: string;
    observed: string;
    establishes: string;
    confirmation: Confirmation;
    criticality: Criticality;
    createdAt: string;
}
export interface Usage {
    usageId: string;
    taskId: string | null;
    actionId: string | null;
    kind: "provider" | "worker" | "execution";
    inputTokens: number | null;
    outputTokens: number | null;
    durationMs: number | null;
    costMicros: number | null;
    /** Cached input is a subset of input; reasoning is a subset of output. Never add again. */
    cachedInputTokens?: number | null;
    reasoningTokens?: number | null;
    source?: string;
    measurementId?: string;
    recordedAt: string;
}
export interface Attempt {
    attemptId: string;
    taskId: string;
    taskVersion: number;
    workspaceId: string;
    worktree: string;
    session: string;
    parentAttempt: string | null;
    createdAt: string;
}
export interface Checkpoint {
    checkpointId: string;
    taskId: string;
    taskVersion: number;
    attemptId: string | null;
    summary: string;
    next: string;
    evidenceIds: string[];
    subject: string | null;
    createdAt: string;
}
export interface LedgerEvent {
    seq: number;
    eventId: string;
    taskId: string;
    kind: string;
    detail: unknown;
    createdAt: string;
}
export interface BatchRequest {
    version: 1;
    workspace: string;
    idempotency_key: string;
    timeout_seconds: number;
    inputs: {
        mode: "declared-roots" | "manifest";
        roots: string[];
        files?: {
            path: string;
            sha256: string;
        }[];
    };
    output_roots: string[];
    cleanup_required: boolean;
    host: "codex" | "claude" | "unknown";
    cases: {
        id: string;
        argv: string[];
        timeout_seconds: number;
        expected_exit_codes: number[];
        depends_on: string[];
        result_receipt?: boolean;
    }[];
}
export interface ExecutionBinding {
    actionId: string;
    request: BatchRequest;
    requestDigest: string;
    authorityRef: string;
    executor: string;
    executorDigest: string;
    stateRoot: string | null;
    jobId: string | null;
    result: Record<string, unknown> | null;
    createdAt: string;
}
export class RevisionConflict extends Error {
    actionId: string;
    expected: number;
    actual: number;
    constructor(actionId: string, expected: number, actual: number) {
        super(`${actionId}: expected revision ${expected}, found ${actual}`);
        this.name = "RevisionConflict";
        this.actionId = actionId;
        this.expected = expected;
        this.actual = actual;
    }
}
export class ExecutionStateUnavailable extends Error {
    constructor(reason: string) { super(`execution state unavailable: ${reason}`); this.name = "ExecutionStateUnavailable"; }
}
