---
id: developer-guide.retained-junit-evidence
title: Validate Retained JUnit Evidence
type: guide
status: current
owner: project-governance
created: 2026-10-06
updated: 2026-10-06
summary: Uses an explicit target pack to validate captured JUnit report integrity without rerunning tests or claiming current acceptance.
---

# Validate retained JUnit evidence

Use `junit-evidence` when a repository deliberately retains test-report XML. It checks captured
report structure, case identities, counters and recorded dispositions. It does not run tests,
call a model, validate arbitrary XML or establish current task acceptance.

## Declare the owner

There is no installed global JUnit pack. Declare a target pack for the exact evidence root:

```yaml
# config/validation/packs/retained-junit.yaml
id: retained-junit
label: Retained JUnit report integrity
implementation_status: active
enforcement: blocking
stages: [pre-commit, pre-push, pre-pr, ci-pr]
run_when: matched
path_globs:
  - evidence/test-reports/**/*.xml
  - evidence/test-reports/**/*.xml.txt
depends_on: []
change_packet_contract: 1
commands:
  - builtin: junit-evidence
```

Use the existing pack declaration as the path authority. Do not widen formatting or lexical
test-quality globs to make reports appear covered. XML outside the declared root keeps its own
owner requirement. Owner-matched paths must end in lowercase `.xml` or `.xml.txt`; unsupported
extensions, including `.XML`, block with `junit-evidence.path-unsupported`. Keep manifest, source
and configuration validation in their own owners rather than adding them to this report pack.
Direct built-in calls without the declaring target pack fail with `checker.invocation-invalid`.
Configuration-only changes do not invent executed report coverage.

The pack runs through the normal check command:

```sh
project-governance plan --stage pre-commit --mode impacted --staged --json
project-governance check --stage pre-commit --mode impacted --staged --summary
```

The checker reads the same immutable subject as the selected pack. An unstaged repair cannot
clear malformed staged XML. The actual executing pack supplies the path boundary; other enabled
JUnit packs do not widen it. The existing runner owns result receipts and cleanup.

## Understand the result

Supported reports have a `testsuite` or `testsuites` root, named suites and named cases. Case
identity includes suite ancestry, classname when present and testcase name. Duplicate suite/case identities,
empty reports, malformed XML, invalid counters, conflicting dispositions and declared/observed
counter mismatches block. Invalid UTF-8 reports `junit-evidence.report-encoding-invalid`. Nested
suites are aggregated. A testcase directly under `testsuites` is unsupported and blocks.
Case-looking strings in CDATA, comments
and captured output do not count as tests. DTD/entity declarations are rejected without network
resolution. Optional `status="run"` and `result="completed"` attributes are supported; other
producer status attributes require explicit qualification and cannot become implicit passes.
Unsupported producer shapes need explicit qualification before adoption.

Each checked report records its captured SHA256, observed tests/failures/errors/skipped counts,
case-identity digest and `reported_execution`. Missing producer counters are not invented; the
declared-counter count reports how many were reconciled. Raw test output and failure bodies are
not copied into findings. The original retained artifact remains available for diagnosis.

The checker result means **artifact integrity**, not passing execution. A correctly retained failed
run remains valid evidence with `reported_execution: failed`. `current_execution` and
`task_acceptance` remain `unknown`, even for an XML report that records passed tests. Skipped cases
remain separate; an all-skipped report is never labelled passed execution. A deleted report has no
after-image to validate and does not prove a replacement report or successful execution.

## Keep provenance with the project

The project owns run identity, source revision, platform, original artifact hashes, retention and
any manifest claiming a passed outcome. Use an existing target adapter to reconcile those claims
against captured originals. For example, if a qualification manifest claims ten passed cases,
compare its report hashes and required identities/counts before accepting that claim. Parsing a
report alone does not prove that claim.

Keep this adapter in the same target pack or a declared dependent pack. Read unchanged manifests
from the captured base plus change overlay, not live worktree replacements. Scope manifest-only
changes to their bound evidence bundle. A removed report still referenced by a retained manifest
must fail that project's provenance check. Historical failure captures must remain honest history;
do not turn them into current source proof or require test reruns merely to retain them.

Adopt at an authorized implementation seam. Preserve active conversations, staged application
changes and ownership. Qualify malformed reports, inconsistent counters, failed historical runs,
entity declarations and opposing staged/live bytes before enabling the required pack. The
[batch verification guide](batch-verification.md) explains the target command contract; the
[validation strategy](../../governance/validation-strategy.md) owns broader proof boundaries.
