---
id: plan.never-acquired-cleanup
title: Recover failed owners that never acquired secondary custody
type: exec-plan
status: active
owner: project-governance
created: 2026-11-02
updated: 2026-11-02
summary: Preserve original failures while qualifying actual absence on existing explicit cleanup adapters.
---

# Never-acquired cleanup

Two explicit recovery adapters lack a qualified representation for failed setup.
A local producer can retain `legacyLockHeld: false` and `legacyLockReleased: false`
because it never acquired its secondary mutex. A device wrapper can fail before its
first actor, leaving an exact device/app pair and an original `notStarted` report.
Neither case authorizes another run or makes the failed work successful.

Keep ordinary local cleanup unchanged. On the already approved observed-local
route, accept the original never-held flags only with directly confirmed failed
native effects, the original mutex mapping, and fresh real-lock/process absence.
On the existing iOS observation route, qualify the exact pair only for an original
failed, never-started actor and never-held lock. Retain fresh qualified device/app
readback, original generations, immutable reports, whole-set atomic release,
create-only journals, replay fences and original failed reconciliation.

The scope is two missing adapter cases. No executor, authority, model, ordinary
admission policy or device-control change belongs to this batch. Captured adopter
programs establish the original control-flow and mutex mapping in the external
maintenance record. An original report is evidence, never executable instructions.

The [Python acquisition/cleanup pattern](https://docs.python.org/3/library/contextlib.html#contextlib.ExitStack)
distinguishes resources actually acquired from setup that failed before acquisition.
The [Kubernetes finalizer contract](https://kubernetes.io/docs/concepts/overview/working-with-objects/finalizers/)
retains an obligation until its owning cleanup condition is satisfied. These overlap
with current generation fencing and actual readback; they do not justify removing a
reservation based only on a producer flag or a host process disappearing.
Reviewed 2026-11-02; Python page updated 2026-11-02, Kubernetes page updated 2025-04-27.

Checkpoint: reproduce both cases against the stable base, complete the coherent
source/specification/test batch, then run affected local/observed/iOS owner tests,
recovered-resource and physical-observer dependencies plus typecheck. Build and
clean-install one immutable archive, then run the same focused public cases with
generation bindings. Obtain independent frozen-slice review and reconcile material
findings. Broaden only if that proof exposes a shared boundary regression.

For an explicitly selected maintenance recovery, the qualified installed candidate
may run its public release command while the original generation remains pinned.
Bind both identities, original reports/control flow, actual mutex paths and exact
lease generations in an external create-only maintenance record. Reconcile using
the original installed entry. A refusal retains custody; no forced release or
private store mutation is available. Adoption and remote publication are separate.

- [x] Both focused synthetic cases fail for the intended adapter reason on the base.
- [x] Source, owning contract and positive/negative fixtures completed.
- [x] Focused source/typecheck and immutable installed proof completed.
- [x] Independent review reconciled.
- [ ] Exact authorized maintenance readback and original reconciliation recorded externally.

The initial affected source batch passed133 cases with7 installed-only skips. Two
new pair cases exposed an undefined canonical scope value; the corrected iOS/pair
recheck passed54 with2 installed-only skips. Independent review requested precise
refusal assertions and incompatible-shape cases; the revised new owner suite
passes31/31. Both material findings were independently rechecked and closed.
The final tuple annotation fixes only test type inference. The exact local archive
clean-installs through the normal runtime stager and passes147/147 affected installed
cases with no skips, including generation bindings and public managed invocation.
Actual maintenance readback remains external and separate from this controlled proof.
This local candidate is not a published stable release and changes no adopter pin.
Normal stable integrated qualification, release metadata and publication/readback
remain separate from this bounded local-maintenance checkpoint.

The already reviewed source repairs subsequently shipped in stable4.5.3 alongside the separately
qualified npm bundle parser correction. The normal final archive verifier and161 installed affected
cases pass; tag/source/archive/metadata and immutable stable/latest readback match. The original
local maintenance archive remains distinct and unpublished. Actual adopter cleanup states and
deliberate installation pins remain external; this release does not upgrade or release them.
