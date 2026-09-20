---
id: research.decision-first-harness.builds
title: Applied To Builds And Checks
type: research
status: draft
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: Applying the decision-first pattern to KMP multiplatform builds, check selection, and failure triage.
---

> Part of the [Decision-First Harness](concept.md) research
> effort. That page carries the concept, the risks, and the sequence.

# Applied To Builds And Checks

The KMP build loop is the most expensive thing in the day, so it is worth being specific about
where a decision layer helps and where it would just be decoration.

## Start By Crediting What Already Exists

Mnemos already has deterministic lane selection in CI. `change-selection` runs first,
`select-build-graph-changes.py` classifies changed paths against a closed policy map in
`config/policies/ci-workflow-bindings.json`, and the downstream lanes - jvm, android, javascript,
apple, native inputs, build-platform - are gated on its output. That is the Tier 0 work most teams
never do, and it is done.

So the honest framing is not "add intelligence to build selection." Selection is handled. The
remaining cost sits in four places selection does not touch.

## 1. Failure Triage

This is the largest and easiest win. A Gradle failure on this repo is almost always one of a small
closed set: a real compile error in common code, an expect/actual mismatch, stale klib or metadata,
KSP ordering, daemon or memory failure, a simulator flake, a toolchain or SDK mismatch, or
dependency resolution. That is a Choice question with eight options.

Feed the decision model the failing task name, the first error block and the exception class -
not the whole log. One call, a fraction of a second, a hundredth of a cent. Ask a second question
in the same call: is this the same cause as the previous failure.

The value is not only the tokens saved by not having a frontier model read a five-thousand-line
log. It is that the class **selects a deterministic next action**:

| Class | Next action | Model involved |
| --- | --- | --- |
| Stale klib or metadata | Clean that cache, retry once | None |
| Daemon or memory | Retry with adjusted memory | None |
| Simulator flake | Retry once | None |
| Toolchain mismatch | Report the exact mismatch | None |
| Real compile error | Build a narrow packet and call a model once | Yes, once |
| Unknown | Stop, hand the human the full log | No |

Most classes never reach a model. That is what shortens the round trip.

One rule keeps this honest: retry at most once, and treat a repeated identical failure as a real
error regardless of what the classifier said. A wrong "stale cache" verdict then costs one build
cycle and corrects itself.

## 2. Canary Ordering Instead Of Full Fan-Out

Today the selected lanes fan out together and the wall clock is set by the slowest macOS lane. A
staged ladder is cheaper:

- **Stage A** - common metadata plus JVM. Fast, and catches most real errors because most code is
  in common source sets.
- **Stage B** - the single lane most likely to break given this change. Was an expect/actual pair
  touched? A native input? A JS ownership boundary? That ranking is a Choice with a confidence.
- **Stage C** - everything else in parallel, only once A and B are green.

This does not make builds faster. It makes failures arrive sooner, which is the actual complaint.

## 3. Build Identity, So Builds Stop Tripping On Themselves

Give every build an identity: a digest of the resolved inputs for the selected targets, the
toolchain, and the lock. The harness owns one build lock per workspace and records each build in the
trace with its identity, targets, duration, outcome and failure class.

- Same identity already built and passed: return the recorded result instead of rebuilding.
- A build already in flight: the second request waits rather than starting a second daemon that
  fights the first over the same caches.

None of this needs a model. It is bookkeeping, and it is most of what "builds tripping on
themselves" actually means.

Note the boundary: this governance runtime deliberately does not duplicate build caching, and its
evidence manifests are explicitly not reusable cached verdicts. So build identity belongs in the
harness. The runtime's `subject_digest` is the right shape to borrow; the responsibility should not
move.

## 4. Tighten Selection From Evidence

`ci-workflow-bindings.json` is a hand-written path-to-family map, and hand-written maps drift in
both directions - too coarse and you over-build, too narrow and you miss. Two improvements, neither
requiring judgment:

- **Families to lanes.** A change can select the whole apple family and spend five macOS runners
  when the module graph says two lanes could break. That mapping is computable from Gradle.
- **Evidence.** Once every build is recorded, the map can be tightened against what actually
  happened: which lanes broke for which paths, which lanes ran repeatedly and never failed, which
  paths were never covered at all.

The decision model's role here is only to flag residual uncertainty - generated code, reflection,
resources - where the deterministic map should widen rather than narrow.

## Same Pattern For Checks

There are 37 `check-*` scripts in this repo. The same three moves apply: select deterministically,
classify failures rather than reading them, and record outcomes so the selection map can be tuned
on evidence instead of intuition.

## The Rule That Keeps It Safe

**Narrowing applies to the inner loop, never to the release gate.** Both repos already separate
routine narrow proof from broad proof at declared boundaries. Keep that line exactly where it is.
If a narrowing decision is wrong, the boundary is what catches it.

## What To Do First, If Only One Thing

Build identity, the build lock, and the staged ladder. None of them call a model, and together they
address most of the wall-clock complaint. They also produce the recorded history that makes triage
worth measuring later. Adding a classifier to a pipeline that still double-builds and fans out
blindly would be decoration.
