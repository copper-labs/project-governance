/**
 * Operational state lives in SQLite. Markdown holds human-authored briefs and ordinary
 * files hold large artifacts; this schema holds the four objects and their annotations.
 *
 * SQLite gives transactional updates to the *record*. It does not make a filesystem or
 * deployment change atomic, which is why Action carries prepared / in-progress /
 * outcome-unknown regardless.
 */
export const SCHEMA_VERSION = 2;

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
`;
