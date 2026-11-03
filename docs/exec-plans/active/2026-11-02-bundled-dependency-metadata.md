---
id: plan.bundled-dependency-metadata
title: Accept declared npm bundles under their enclosing archive
type: exec-plan
status: active
owner: project-governance
created: 2026-11-02
updated: 2026-11-02
summary: Finish the prepared parser correction, qualify the stable patch and retain strict ordinary metadata checks.
---

# Bundled dependency metadata

A valid generated npm lockfile can record bundled children without separate download URLs or
integrity. The existing parser rejects those bytes as new source/integrity defects when a package
tree enters a broader Git comparison. The repair belongs in the canonical compiled checker, not
an adopter lockfile rewrite, policy override or installed-payload edit.

Reuse the prepared correction after verifying its parser/test base is unchanged between stable
4.5.1 and 4.5.2. A non-link enclosing archive must retain ordinary exact version, trusted registry
tarball and SHA-512 checks. Traverse only its declared bundle/dependency closure within its tree.
Children retain version validation and validate any explicit source/hash. Undeclared, orphaned,
linked-parent, malformed-version and untrusted metadata cases remain failures.

[npm's lockfile documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/)
identifies `inBundle` and the parent-extracted legacy representation. The page reports an update
on2025-10-04. The [original package metadata documentation](https://github.com/npm/cli/blob/latest/docs/lib/content/configuring-npm/package-json.md#bundledependencies)
explains that named dependencies ship in the enclosing archive. Both were read2026-11-02;
the latter's file update was verified as2026-06-18 through the original repository's commits API.
The applicable overlap is archive
ownership and declared reachability; this correction supplies that missing parser step. These
normative format descriptions do not prove accepted development or a security audit of fetched bytes.

The batch includes source, negative fixtures and the owning kernel explanation. Run the affected
dependency checker tests and typecheck, then the normal stable-release integrated and exact-archive
proof. Reuse applicable unchanged source review for separately qualified existing patch repairs.
Obtain independent review of the new parser slice and reconcile material findings. Commit through
normal hooks. Publish only a stable next patch based on the latest stable line, with immutable
archive/metadata/tag/readback proof. Adopter installation uses the normal versioned operation and
must preserve existing project edits, live owners, permissions and dependency versions.

- [x] Prepared source/base and original failure verified.
- [x] Focused parser/negative proof and typecheck complete.
- [x] Independent review reconciled.
- [x] Integrated and exact installed-archive release proof complete.
- [x] Stable release identity and readback verified.

Adopter paths, errors, installation records and actual check receipts remain external to this
project-neutral source. Existing cleanup repair qualification remains with its owning plan.

Opus5.5 high independently reviewed and rechecked the new slice, closing both material test gaps.
The final dependency batch passes35/35. The two runtime follow-ups confine the exemption to modern
lockfiles and align parent-name validation with the ordinary parser. Exact negative cases cover
all parent trust gates and outer-tree escape; a low review follow-up also isolates the version gate.
The parser tests can select the installed artifact owner for final archive qualification.

The integrated engine checkpoint passed1481 with25 installed-only skips. Its nine failures were
caused by omitting an existing Ruff installation from the selected proof PATH; all34 affected lint
and plan cases pass with the corrected environment. Harness82/82 and scripts142 pass with5 explicit
skips. The final dependency checkpoint follows the unchanged integrated proof; no passing cases
are synthesized or counted as accepted development.

Stable4.5.3 is published from`c47898611b8d92f3186a7f9b105a82ebd0418540`.
The normal archive verifier passes, including clean staging, installed host/workflow journeys and
real lint backends. The exact archive passes161 installed parser/cleanup cases without skips.
Published tag, source commit, all three asset digests, runtime metadata, immutable release and
stable/latest readback match. GitHub's existing4.x tag workflow was skipped; qualification ran
locally. Adopter activation and notification remain deliberate owner operations, recorded externally.
