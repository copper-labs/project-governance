/**
 * The four objects. Everything the runtime owns is one of these.
 * Decisions are annotations on them, never a fifth object.
 */

/** Provenance is part of the content. The three kinds are never merged. */
export type Provenance = "operator" | "observed" | "hypothesis";

export type TaskStatus = "open" | "needs-input" | "accepted" | "cancelled";

/**
 * What kind of work a job is.
 *
 * `explore` means the job produces understanding, specs or plans and will not change code.
 * It matters because two threads sharing one folder collide only when one of them writes:
 * an exploring job neither raises nor receives file-overlap warnings, which removes the
 * main source of false alarms in the shared-workspace case.
 */
export type TaskMode = "implement" | "explore";

export type TaskItemKind =
  | "constraint"
  | "acceptance"
  | "scope"
  | "open-question"
  | "ruled-out"
  | "handoff";

export interface TaskItem {
  seq: number;
  kind: TaskItemKind;
  provenance: Provenance;
  body: string;
  revoked: boolean;
}

/** A Task holds the objective. Versioned; revisions never edit in place. */
export interface Task {
  taskId: string;
  version: number;
  supersedes: number | null;
  outcome: string;
  status: TaskStatus;
  items: TaskItem[];
  createdAt: string;
  /** Which worktree and branch this job was started from. A store is shared across worktrees. */
  worktree: string | null;
  branch: string | null;
  /** Set when this job was forked from another, such as a branched conversation. */
  parentTask: string | null;
  /** Which conversation created this version. */
  session: string | null;
  mode: TaskMode;
}

/**
 * Action status. `prepared` and `in-progress` exist because a durable record does not
 * make an effect atomic; `outcome-unknown` is a real terminal state, not a failure.
 */
export type ActionStatus =
  | "proposed"
  | "authorized"
  | "prepared"
  | "in-progress"
  | "completed"
  | "verified"
  | "refused"
  | "cancelled"
  | "outcome-unknown";

/** Operations the harness may perform. Writing to a working tree is deliberately absent. */
export type Operation = "read" | "check" | "record" | "transmit";

export interface Action {
  actionId: string;
  taskId: string;
  taskVersion: number;
  operation: Operation;
  /** Paths, systems and resources this Action may touch. From the Task and policy only. */
  scope: string[];
  /** Where an effect lands when it leaves this machine. Never inferred. */
  destination: string | null;
  policyRevision: string;
  status: ActionStatus;
  /** Monotonic; every transition supplies the revision it expected to find. */
  revision: number;
  expectedInputs: string[];
  intendedOutputs: string[];
  /** How this Action's real effects can later be reconciled after an interruption. */
  reconcile: string | null;
  refusedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ArtifactKind = "snapshot" | "patch" | "document" | "log" | "receipt";

export interface Artifact {
  artifactId: string;
  kind: ArtifactKind;
  /** The exact source version this came from. Absent means unbound, which is reportable. */
  subject: string | null;
  /** Large content lives as an ordinary file and is referenced, never inlined. */
  path: string | null;
  inline: string | null;
  bytes: number;
  provenance: Provenance;
  createdAt: string;
}

/** Whether an observation established its claim, or merely failed to contradict it. */
export type Confirmation = "confirmed" | "unconfirmed" | "refuted";

/** Execution-critical state is durable before its Action; analytics is best-effort. */
export type Criticality = "execution" | "analytics";

export interface Evidence {
  evidenceId: string;
  taskId: string | null;
  actionId: string | null;
  artifactId: string | null;
  /** What was being checked. */
  claim: string;
  /** What was seen. */
  observed: string;
  /** What that observation actually establishes, which is often less than it appears. */
  establishes: string;
  confirmation: Confirmation;
  criticality: Criticality;
  createdAt: string;
}

/** Token and cost instrumentation, emitted from the first run rather than reconstructed later. */
export interface Usage {
  usageId: string;
  taskId: string | null;
  actionId: string | null;
  kind: "provider" | "worker" | "execution";
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  costMicros: number | null;
  recordedAt: string;
}

/** Raised when a transition's expected revision no longer matches. The caller must not act. */
export class RevisionConflict extends Error {
  actionId: string;
  expected: number;
  actual: number;
  constructor(actionId: string, expected: number, actual: number) {
    super(`action ${actionId}: expected revision ${expected}, found ${actual}`);
    this.name = "RevisionConflict";
    this.actionId = actionId;
    this.expected = expected;
    this.actual = actual;
  }
}

/** Raised when execution-critical state cannot be persisted. The dependent Action must not run. */
export class ExecutionStateUnavailable extends Error {
  constructor(reason: string) {
    super(`execution state unavailable: ${reason}`);
    this.name = "ExecutionStateUnavailable";
  }
}
