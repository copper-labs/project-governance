# Consolidate into Project Governance

Date: 2026-09-19
Status: recommendation for decision; no repository migration performed.
Scope: source organization, packaging, qualification and cutover for Codex-only adoption.

## Recommendation

Move Project Harness into the **existing project-governance repository**, under `components/harness/`,
before building its integrated release. Keep governance's repository identity, Python source layout,
release tags, package name and adopter update URLs. Do not create a third umbrella repository or put
the established governance project underneath the new harness repository.

Make this a small monorepo with two internal modules and one supported product. Keep the existing
TypeScript runtime; do not rewrite it into Python just to reduce the language count. Preserve the
public JSON boundary even though both sides can now change in one pull request.

Prefer **one governance wheel containing the harness runtime as package data**, rather than two
independently downloaded artifacts. Prove that packaging path before committing to it. Node remains
an explicit prerequisite for enabled continuity; placing TypeScript in a wheel does not supply Node.

This refines two earlier recommendations: consolidate source before integrated packaging, and try
single-wheel packaging before building a multi-artifact manifest/lock protocol. The accepted product
scope is unchanged. This document proposes revisions to the installation/adoption specs; it does not
silently claim those revisions have been implemented or accepted.

## Why this arrangement fits this project

The user has removed the main reason to operate two products: standalone harness adoption. Changes
to continuity, execution receipts, startup and installation will frequently cross the current repo
boundary. One branch can change both interfaces, test them together and publish one qualified result.
It also removes repeated cross-repository context gathering during this early design period.

The existing governance repository has the mature distribution surface: semantic releases, pinned
wheel locks, immutable release publication, candidate runtime generations and installed-wheel tests.
The harness package is private, version 0.0.0 and has no runtime dependencies. Relocating the smaller
module avoids moving the established product and all its adopter references.

A monorepo does not itself solve token spend or make builds faster. Poor CI scoping could make both
worse. Its value here is simpler coordinated changes and delivery; the development-loop and
measurement contracts remain necessary.

| Option | Consequence | Decision |
| --- | --- | --- |
| Existing governance repo contains harness | One PR/release; preserve adopter identity; modest import | Recommend |
| Existing harness repo contains governance | Move the mature release/configuration center into the prototype | Reject |
| New umbrella repo contains both | Migrate remotes, CI, releases and project setup without added capability | Reject |
| Two repos with composed release | Reconcile two source revisions, coordinated PRs and release timing | No longer justified for the current product scope |
| Submodule or continuing subtree synchronization | Retain a second source-of-truth/update mechanism | Reject; use a one-time history import only |

## Target source layout

```text
project-governance/
  AGENTS.md                         # concise product-wide rules and navigation
  src/project_governance_runtime/   # existing Python policy/executor/installer
  tests/                            # existing Python suite; integrated contract tests
  components/
    harness/
      AGENTS.md                     # Node-specific commands and module boundaries
      package.json                  # private; development tooling, no npm product release
      package-lock.json
      tsconfig.json
      bin/harness
      src/                          # existing TypeScript, moved without redesign
      test/
      docs/                         # harness specs/plans/reviews, preserved initially
      CHARTER.md
      README.md
  docs/
    system-spine.md                # one product map; links into module contracts
    governance/                   # existing authoritative governance policies
  tools/                          # packaging and installed-product qualification
  .github/workflows/              # existing readiness/publication, extended in place
```

Do not move Python into a new packages tree, move all documents twice, rename commands and redesign
storage during the import. Module documentation remains authoritative at its imported location;
root navigation links to it. Historical research under governance's existing
`docs/research/decision-first-harness/` stays explicitly historical, not a second current specification.

Preserve the current `harness-agent` executor name. It is not the continuity CLI. Keep `harness` as a
compatibility launcher if helpful; expose a governance-owned entry only as a thin delegation to the
same TypeScript implementation. Do not create two command implementations or rename everything as
part of migration. Packaging must bind that entry to its own installed executor generation.

## Packaging: test the simplest route first

Setuptools supports non-Python package data inside a distribution. That makes carrying this small
runtime technically plausible without a second downloader. The exact layout and clean-install
behavior still require a proof. [Setuptools package-data documentation](https://setuptools.pypa.io/en/latest/userguide/datafiles.html)

Proposed installed structure:

```text
selected governance runtime generation/
  bin/project-governance
  bin/harness-agent
  bin/harness                     # thin optional compatibility entry
  .../site-packages/project_governance_runtime/
    ...existing Python runtime...
    assets/harness/
      package.json                # runtime ESM metadata only
      src/**/*.ts                 # required runtime sources
      payload-manifest.json       # generated diagnostic/integrity inventory
```

Build package data from the one canonical `components/harness` tree into temporary build output.
Do not maintain a checked-in copy under Python assets. The build must work from a clean checkout and
from its source distribution; exclude test fixtures, node_modules, developer dependencies, local
state, logs and credentials. Include required notices and verify the intended import is publishable.
No TypeScript transpilation is required if native stripping works at the installed path.

The wheel digest already binds all embedded bytes. Reuse the existing release tag, lock and update
metadata as the product identity; an internal payload inventory is diagnostic, not another editable
lock. Avoid a lock-schema change solely to pin a second component that is inside the same artifact.
Update schemas only if the actual prerequisite/integration contract needs it, and preserve old locks
where compatible. Classify the first integration as deliberate adoption in startup compatibility
metadata rather than forcing it through automatic updates.

The launcher resolves the installed package resource and an explicitly configured/qualified Node
executable, preserves the caller's workspace and arguments, and reports the same exit/JSON outcome.
It invokes the executor from its own generation, never whichever `harness-agent` happens to be first
on PATH. No implicit system Node installation. Governance-only work continues when Node is absent;
enabled continuity reports a clear unavailable state instead of pretending it works.

Packaging qualification must prove Node 22.18 support, the current qualified Node, `node:sqlite`,
relative module imports, filenames with spaces, working-directory independence and clean dependencies.
The TypeScript loader runs from package assets rather than a node_modules tree. The prerequisite probe
must exercise actual required features, not only compare a version string.

If this packaging proof fails for a concrete platform/distribution reason, fall back to one governance
release containing a wheel and exact companion tarball with a single composition manifest. Do not
build that fallback speculatively. An embedded Node binary is also deferred: it adds platform, patch
and redistribution work before missing-Node adoption has been measured.

## Plan of action

### Phase 0 — Freeze a recoverable source snapshot

The present harness tree contains substantial uncommitted implementation and specification work.
Importing its current HEAD alone would omit that work. Governance also has untracked research content.

- Inventory tracked changes, untracked files, active worktrees/jobs and ownership in both repositories.
  Review what belongs in the import; never use blanket staging or deletion to obtain a clean status.
- Preserve the approved harness work as a named source commit, plus a local Git bundle/backup and
  source file/mode manifest. Verify the backup is readable. Keep runtime databases/logs separate from
  source; committing code does not back up ignored operational history.
- Capture the exact governance base. Verify the intended authoritative remote: its local checkout
  currently has `origin` and `canonical`, while release code points at copper-labs. Do not infer a push
  destination from the name `origin`. Harness currently has no configured remote in this checkout.
- Capture baseline tests/typecheck and current public adapter behavior for the exact source snapshot.
  The earlier 71-test receipt is historical evidence, not proof of this future snapshot.

Exit: a reproducible source snapshot and clean migration workspace, with unrelated work untouched.

### Phase 1 — One-time history import, no product behavior change

Use an isolated governance worktree and a `codex/` migration branch. Import the frozen harness history
under `components/harness/` without rewriting governance history. Prefer a non-squashed subtree-style
import that retains original harness commits as ancestors. This is a one-time merge, not an ongoing
subtree synchronization arrangement. Rehearse and verify the exact Git operation in disposable
checkouts before applying it to the migration branch.

Git supports retaining another tree under a prefix and explicitly joining unrelated histories; those
primitives do not themselves prove an import preserved content. Validate the result independently.
[Git prefix import](https://git-scm.com/docs/git-read-tree#Documentation/git-read-tree.txt---prefixltprefixgt),
[Git history merge](https://git-scm.com/docs/git-merge#Documentation/git-merge.txt---allow-unrelated-histories)

- Verify imported file bytes and modes against the source manifest, and original source commits remain
  reachable. Do not claim path history is unchanged: old commits still have their original root paths.
- Keep executable code unchanged in the import commit. Follow with a small path/navigation commit for
  module working directories, launchers, tests and documentation. Existing tests use relative paths
  such as `src/cli.ts`; run them from the module root or make those paths explicit.
- Reconcile root/module instructions. Keep policy in governance; the module file provides scoped build
  commands and boundaries. Avoid two competing start-here documents or duplicate managed hooks.
- Keep runtime databases out of Git. The new monorepo is a new source repository identity; do not copy
  an old operational SQLite file into its Git directory or silently merge histories. If useful, use
  existing selected export/quarantined import for reference, then explicitly create/bind new attempts.
- Run module tests/typecheck and the relevant governance packaging/path checks. Complete governance's
  required readiness boundary before merging this PR. No enabled harness behavior ships in this phase.

Exit: one source tree, retained history, equivalent harness behavior and unchanged governance adoption.

### Phase 2 — One installed product

In a second focused change, add package-data assembly, the generation-bound launcher, Node capability
probe and installed-product contract tests. Extend existing build/release tools instead of introducing
an independent npm release or a second updater.

First run a clean-install vertical proof: build wheel → install into an empty environment → invoke
continuity from a fixture adopter → resume task → dispatch/recover one declared check → read result.
Remove access to the source checkout for the installed proof, so accidental source imports cannot pass.
Also test missing Node, stale/invalid payload and preservation of governance-only functionality.

Then qualify generation activation and recovery. A single artifact removes component-pair skew; it
does not make database migrations atomic. Retain the existing runtime-use leases and generation
ownership, protect active jobs, and reject incompatible store changes while writers are active.
Old jobs must remain observable through their original generation. Code rollback cannot erase newer
history or undo a storage migration; disabling continuity is the safe rollout fallback when needed.

Exit: one installed wheel and lock, correctly bound module/executor, proven upgrade interruption and
explicit prerequisite failures. Update the accepted installation spec to the proven packaging choice.

### Phase 3 — Qualify Codex and a measured pilot

Use the existing adoption plan, now within one repository. Complete native session/reopen/interruption
and worktree qualification, bounded telemetry/reporting and one local-check workflow. Enable continuity
explicitly for one adopter; other adopters remain on their existing behavior until deliberately upgraded.

Exercise two sessions sharing a workspace and two linked worktrees sharing history. Preserve advisory
path intentions, source-drift checks and existing device/resource owners. A monorepo does not serialize
agents, isolate devices or prove safe concurrent editing.

Measure duplicate invocations, context rebuilt, resume/recovery, native usage coverage and accepted
work. Add one expensive device workflow only after the local path is solid. Keep Cowork, JEV, indexing,
Mnemos and additional orchestration out of the migration itself.

Exit: actual Codex receipts and pilot evidence for the exact packaged release. Publication still follows
existing source readiness, immutable tag/release verification and destination readback; a local wheel
is not a published release.

### Phase 4 — Cut over development and retire the old source location

After the import is merged, direct all new module edits to governance; do not maintain dual-write
repositories. Keep this checkout as a frozen reference until packaging and pilot qualification pass.
Add a clear relocation pointer when executing the cutover, update local project/task configuration
where requested, and carry forward active plans/review evidence.

Only retire/delete/archive old project locations after confirming no active agent/worktree/task depends
on them and backups/import history are usable. Since this checkout currently has no remote, do not
assume a hosted repository exists to archive. The first pilot can disable continuity without rolling
back ordinary governance checks or deleting operational history.

Exit: one development home, one product release path, no duplicated current specs or active writers.

## CI and everyday work

Keep language-local tools: existing Python tests, `npm --prefix components/harness test` and
`npm --prefix components/harness run typecheck`. Root tooling should only route to these commands.
No Nx, Turborepo, Bazel, package registry or general workspace framework is justified for two modules.

| Change | Focused development proof |
| --- | --- |
| Python checker only | Affected Python tests and existing selection obligations |
| Harness-only behavior | Module tests/typecheck and affected public contract seam |
| Installer/launcher/lock/executor protocol | Both modules' affected tests and clean installed-wheel contract |
| Documentation | Links/contract consistency plus applicable existing governance checks |
| Release candidate | Existing full readiness/publication requirements, extended with module and installed-product proof |

Path-aware development checks reduce cost; they do not silently weaken mandatory release gates.
Unknown/shared changes select the conservative affected set. The currently inspected CI runs on Linux;
add explicit macOS/Codex qualification for the supported product target, retaining existing governance
coverage. Avoid a full desktop/device matrix on every small edit.

Keep root instructions compact and load module details when needed. Both modules can change in one
reviewable PR, but freeze candidate and proof at the same boundaries. One repository is not a reason
to read every specification or run every check for every task.

## Reviewable batches and stop conditions

| Batch | Reviewable result | Stop rather than paper over |
| --- | --- | --- |
| A: import and navigation | Source/history manifest, unchanged behavior, one development home | Unowned dirty work, missing snapshot files or unexpected source changes |
| B: packaging and activation | One-wheel clean-install proof, Node probe, recovery tests | Dependence on checkout, mismatched owner generation or unsafe migration |
| C: Codex adoption | Exact-release host receipts and measured first workflow | Lost jobs, duplicated hooks, weakened proof or unexplained cost regression |

Each batch can contain several small commits; do not force a large migration plus telemetry plus
new device logic into one review. No exact elapsed estimate is justified until packaging is rehearsed.
The pure source move should be the smallest batch; installed-product and host qualification carry
most of the uncertainty. Do not count organizational consolidation itself as token savings.

## Evidence and decision needed

Inspected read-only: governance `setup.cfg`, `MANIFEST.in`, release/source-readiness workflows,
`tools/build_release_assets.py`, `installation.py`, `startup_installation.py`, release policy and Git
status/remotes. Inspected harness package/launcher/tests/status and current installation contracts.
No builds, installs, commits, branches, remote changes or files in governance were made for this plan.

The decision is to adopt **governance as the source home, one-time history import first, single-wheel
packaging proof second, then Codex pilot**. If accepted, amend the earlier two-artifact/later-migration
spec wording as part of batch A and execute the migration in governance's authorized workspace.
