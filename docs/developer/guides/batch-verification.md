---
id: developer-guide.batch-verification
title: Get Useful Feedback Before Review
type: guide
status: current
owner: project-governance
created: 2026-10-04
updated: 2026-10-04
summary: Uses existing project-owned validation packs for early focused feedback and verifies that tests catch an intended fault.
---

# Get useful feedback before review

Use this guide when repeated review rounds catch problems a small check could find earlier. The
existing pack runner owns selection, execution and results. The
[next major specification](../../specs/engine-4-verification-feedback.md) explains the release scope;
the [validation strategy](../../governance/validation-strategy.md) owns when broader proof is needed.

## Declare a small check

A project can declare a `batch` stage in a target-owned pack. This Python whitespace-check example
uses an existing built-in checker; it does not install a tool or create another runner:

```yaml
# config/validation/packs/project-batch-format.yaml
id: project-batch-format
enforcement: blocking
stages: [batch]
path_globs: ["**/*.py"]
commands:
  - builtin: format
```

The example establishes Python whitespace formatting only. A real project chooses the lint, compile or focused test
commands appropriate to its stack and records their actual cost before calling the stage cheap.
Target command adapters must return the runner's structured checker result. Ordinary test-runner
stdout alone is not that protocol; use the project's existing adapter rather than interpreting an
unrelated successful exit as valid governance evidence.

The runtime supplies a captured change packet, but an ordinary compiler or linter can still read
live files if its adapter ignores that packet. Say which input it uses. A changed-file rule can read
packet after-images; a whole-program build needs the complete candidate, dependencies and configuration.
Qualify opposing staged/unstaged bytes before calling either result exact-candidate proof.

Inspect selection, then run the affected batch through the installed runtime:

```sh
project-governance plan --stage batch --mode impacted --base-ref HEAD --json
project-governance check --stage batch --mode impacted --base-ref HEAD --summary
```

The comparison includes the current change against HEAD. A repository before its first commit
uses its initial-change scope instead of a nonexistent HEAD:

```sh
project-governance check --stage batch --mode impacted --summary
```

Every affected path needs an owner at that stage. If the example pack does not own a changed
document or configuration path, extend the project stage deliberately or request the named pack
for a narrower diagnostic check. Do not silence unknown-path findings or imply that the narrower
check established complete batch coverage. A stage with no declared pack is blocked.

Path globs select pack owners; they do not infer application dependencies. Use the build tool's
affected-project command or conservative coverage for shared source, lockfiles and configuration.
A rename can affect both the old and new owners. Keep build and test caches with that tool.

## Put the check before its dependent review

When a governed workflow already contains both steps, declare the review's dependency on the
check. Failed prerequisites block dependent work through the existing executor. Independent
checks and required cleanup retain their normal behavior. A standalone design review does not
need an unrelated application build.

Give the reviewer the task requirement, exact candidate identity, compact findings, known proof
limits and references to the full originals. Fix a concrete check failure before paying for a
review whose prerequisite failed. Recheck the repaired owner; do not repeat a full review merely
because a short check or observation finished.

This declaration proves ordering only when the actual caller invokes the workflow. Codex's Stop
hook is not a completion gate. If a host bypasses the declared path, record the missing execution
coverage and qualify that host integration before claiming automatic enforcement.

## Show that the test detects the intended fault

For an important behavior, use a disposable fixture:

1. Run the test on correct behavior and require a pass.
2. Introduce one known fault, such as omitting a cleanup callback.
3. Run the same check and require the expected behavioral failure.
4. Restore correct behavior and require a pass.

Confirm the failure identity and actual command result. A missing executable, malformed result or
timeout is an infrastructure failure, not proof that the test caught the seeded defect. Use a few
representative faults alongside their owning tests; no general mutation engine or blanket coverage
percentage is required.

When adopting a linter baseline, distinguish unchanged old debt from a new violation replacing an
old one at the same count. Some tools suppress counts rather than exact findings. Test that case,
renames and changed configuration, and do not silently regenerate a baseline during checking.

## Keep each tool's responsibility clear

Code owns path selection, execution, exact evidence, permissions, required checks and cleanup.
JEV's optional review advice assesses meaning in captured evidence. The coding model diagnoses
and changes code. Models cannot waive a required check or turn unknown cleanup into success.

The next major extends semantic review capture to Kotlin, Swift and Python alongside JS/TS. Its
source tests must prove language support and staged identity before release. Source capture or a
fixture response is not evidence that JEV judged a real change correctly. Measure missed defects,
false findings, extra reads and rework alongside available usage before claiming savings.
