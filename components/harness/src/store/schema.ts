/**
 * Operational state lives in SQLite. Markdown holds human-authored briefs and ordinary
 * files hold large artifacts; this schema holds the four objects and their annotations.
 *
 * SQLite gives transactional updates to the *record*. It does not make a filesystem or
 * deployment change atomic, which is why Action carries prepared / in-progress /
 * outcome-unknown regardless.
 */
export const SCHEMA_VERSION = 6;
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS task (
  task_id    TEXT    NOT NULL,
  version    INTEGER NOT NULL,
  supersedes INTEGER,
  outcome    TEXT    NOT NULL,
  status     TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  worktree   TEXT,
  branch     TEXT,
  parent_task TEXT,
  session    TEXT,
  mode       TEXT,
  PRIMARY KEY (task_id, version)
) STRICT;

CREATE TABLE IF NOT EXISTS task_item (
  task_id    TEXT    NOT NULL,
  version    INTEGER NOT NULL,
  seq        INTEGER NOT NULL,
  kind       TEXT    NOT NULL,
  provenance TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  revoked    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (task_id, version, seq),
  FOREIGN KEY (task_id, version) REFERENCES task(task_id, version)
) STRICT;

CREATE TABLE IF NOT EXISTS action (
  action_id        TEXT    PRIMARY KEY,
  task_id          TEXT    NOT NULL,
  task_version     INTEGER NOT NULL,
  operation        TEXT    NOT NULL,
  scope            TEXT    NOT NULL,
  destination      TEXT,
  policy_revision  TEXT    NOT NULL,
  status           TEXT    NOT NULL,
  revision         INTEGER NOT NULL,
  expected_inputs  TEXT    NOT NULL,
  intended_outputs TEXT    NOT NULL,
  reconcile        TEXT,
  refused_reason   TEXT,
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL,
  session          TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS action_by_task ON action(task_id);
CREATE INDEX IF NOT EXISTS action_by_status ON action(status);

CREATE TABLE IF NOT EXISTS artifact (
  artifact_id TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  subject     TEXT,
  path        TEXT,
  inline      TEXT,
  bytes       INTEGER NOT NULL,
  provenance  TEXT NOT NULL,
  created_at  TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS evidence (
  evidence_id  TEXT PRIMARY KEY,
  task_id      TEXT,
  action_id    TEXT,
  artifact_id  TEXT,
  claim        TEXT NOT NULL,
  observed     TEXT NOT NULL,
  establishes  TEXT NOT NULL,
  confirmation TEXT NOT NULL,
  criticality  TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  session      TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS evidence_by_task ON evidence(task_id);
CREATE INDEX IF NOT EXISTS evidence_by_action ON evidence(action_id);

CREATE TABLE IF NOT EXISTS usage (
  usage_id      TEXT PRIMARY KEY,
  task_id       TEXT,
  action_id     TEXT,
  kind          TEXT NOT NULL,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  duration_ms   INTEGER,
  cost_micros   INTEGER,
  recorded_at   TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS usage_by_task ON usage(task_id);

-- Who is working where, so concurrent sessions in one worktree are visible to each other.
-- This is awareness, not a lock: the harness does not hold the pen and must not pretend to.
CREATE TABLE IF NOT EXISTS session_activity (
  session     TEXT NOT NULL,
  worktree    TEXT NOT NULL,
  task_id     TEXT,
  tree_digest TEXT,
  last_seen   TEXT NOT NULL,
  PRIMARY KEY (session, worktree)
) STRICT;

CREATE INDEX IF NOT EXISTS activity_by_worktree ON session_activity(worktree, last_seen);

`;
/** Version 5 adds continuity records without changing historical evidence. */
export const V5 = `
ALTER TABLE task ADD COLUMN parent_version INTEGER;
ALTER TABLE task ADD COLUMN parent_checkpoint TEXT;
ALTER TABLE artifact ADD COLUMN blob_path TEXT;
ALTER TABLE usage ADD COLUMN cached_input_tokens INTEGER;
ALTER TABLE usage ADD COLUMN reasoning_tokens INTEGER;
ALTER TABLE usage ADD COLUMN source TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE usage ADD COLUMN measurement_id TEXT;
CREATE UNIQUE INDEX usage_measurement ON usage(source, measurement_id) WHERE measurement_id IS NOT NULL;
CREATE TABLE workspace (workspace_id TEXT PRIMARY KEY, locator TEXT UNIQUE NOT NULL, path TEXT NOT NULL) STRICT;
CREATE TABLE attempt (attempt_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, task_version INTEGER NOT NULL,
 workspace_id TEXT NOT NULL, worktree TEXT NOT NULL, session TEXT NOT NULL, parent_attempt TEXT, created_at TEXT NOT NULL,
 FOREIGN KEY(task_id,task_version) REFERENCES task(task_id,version)) STRICT;
CREATE TABLE binding (session TEXT NOT NULL, workspace_id TEXT NOT NULL, attempt_id TEXT NOT NULL,
 PRIMARY KEY(session,workspace_id), FOREIGN KEY(attempt_id) REFERENCES attempt(attempt_id)) STRICT;
CREATE TABLE checkpoint (checkpoint_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, task_version INTEGER NOT NULL,
 attempt_id TEXT, summary TEXT NOT NULL, next TEXT NOT NULL, evidence_ids TEXT NOT NULL, subject TEXT, created_at TEXT NOT NULL,
 FOREIGN KEY(task_id,task_version) REFERENCES task(task_id,version)) STRICT;
CREATE TABLE ledger (seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE NOT NULL, task_id TEXT NOT NULL,
 kind TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
CREATE INDEX ledger_task ON ledger(task_id,seq);
CREATE TABLE budget (task_id TEXT PRIMARY KEY, ceiling INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0) STRICT;
CREATE TABLE task_artifact (task_id TEXT NOT NULL, artifact_id TEXT NOT NULL, PRIMARY KEY(task_id,artifact_id),
 FOREIGN KEY(artifact_id) REFERENCES artifact(artifact_id)) STRICT;
CREATE TABLE execution (action_id TEXT PRIMARY KEY, request TEXT NOT NULL, request_digest TEXT NOT NULL,
 authority_ref TEXT NOT NULL, executor TEXT NOT NULL, executor_digest TEXT NOT NULL, state_root TEXT,
 job_id TEXT, result TEXT, created_at TEXT NOT NULL, FOREIGN KEY(action_id) REFERENCES action(action_id)) STRICT;
CREATE TABLE path_intent (session TEXT NOT NULL, workspace_id TEXT NOT NULL, task_id TEXT NOT NULL,
 path TEXT NOT NULL, mode TEXT NOT NULL, digest TEXT, seen_at TEXT NOT NULL,
 PRIMARY KEY(session,workspace_id,task_id,path,mode)) STRICT;
CREATE TABLE imported_bundle (digest TEXT PRIMARY KEY, source_repository TEXT NOT NULL,
 payload TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
`;
export const V6 = `ALTER TABLE task_item ADD COLUMN origin TEXT; DROP TABLE IF EXISTS task_path;`;
