---
id: review.optional-computer-use-design-reconciliation
title: Optional Computer Use Design Reconciliation
type: review
status: current
owner: project-governance
created: 2026-10-06
updated: 2026-10-06
summary: Reconciles Opus 5.5 medium findings on optional Holo grounding and realistic Decisions testing.
---

# Optional computer use design reconciliation

Owners: [specification](../specs/engine-optional-computer-use-testing.md) and
[implementation plan](../exec-plans/active/2026-10-06-optional-computer-use-testing.md).
This review covers design only. Source implementation, installation, local model setup and paid
combined testing remain future proof.

## Review evidence

Claude Opus 5.5 (`claude-opus-5-5`) reviewed frozen candidates at medium effort with fallback
disabled. The initial review and focused recheck both completed with exit 0, no timeout and no
workspace changes in their wrapper audits. The review mode was read-only. Raw assignments,
responses and audits remain outside this reusable checkout.

Initial candidate SHA256:

- Spec: `f027c11fa815828745d79842b4f3ebae41a34d0c5cdb34f4c127d8979d65e4ce`.
- Plan: `a0f3d0a5db4ea0d1d06d37a9ea711d285ef4d9dc1b35d83859c8e961559b66d8`.

Focused recheck candidate SHA256:

- Spec: `5d89760fd3f03cfd0b8e5034a68790b3898cdeaf44f02d57111b059d7e7e9e03`.
- Plan: `ff8f28d89c25fea08508c3901e6ed88b9cdecce1be968cf0143f612013e68b0d`.

## Reconciliation

| ID | Finding and accepted correction |
| --- | --- |
| CU-01 | Optional absence has no new native status. Emit warning plus an advisory not-run finding and exit 0; a bare warning normalizes to passed. Required absence emits failed plus blocking/nonzero. Never use not-applicable, which can qualify passing proof. Verified against `checker-results.ts` and `plan-proof.ts`. |
| CU-02 | Settle ownership: first delivery is a thin caller-owned Holo client and experiment command through existing custom checks and the planned evaluator. No speculative engine/export/packaging changes. A named shared gap requires a separate accepted change. |
| CU-03 | Replace two nondeterministic action executions with one action trial and paired evaluation of its frozen checkpoint captures. This measures detection and added cost; adaptive completion benefit remains unproved. |
| CU-04 | Exclude held-back truth labels and native oracle state from both model requests. Public Choice options/Score legends remain question definitions. Assert payload exclusion in caller tests. |
| CU-05 | Narrow freshness to declared fixture events, admit the check/click race and assign seeded fault outcome classes. Wrong targets missed by the precheck must fail the hidden native oracle. |
| CU-06 | Evaluate after the action run in a separate command. Only it receives the OpenAI key. Driver/browser/Holo use a minimal environment, proven by a caller canary; reuse evaluator B3 credential forwarding proof. |
| CU-07 | Flush runner action intent before dispatch. Interrupted runs end unresolved; a new run resets the disposable fixture and references the old identity. No resumed agent service or second state store. |
| CU-08 | Use literal loopback, reject redirects/hostnames and bind the server to loopback. Record inspected setup and operator-declared local inference honestly; a loopback proxy cannot attest to loaded weights or processing location. |
| CU-09 | Required visual adoption is future work. Preserve the required-absence rule with one synthetic failed-command fixture rather than claim a qualified visual gate. |
| CU-10 | Parse evaluation envelopes on either exit, retaining partial answers. No valid envelope means unavailable requested questions. Evaluation failure does not rewrite native results. |

The focused recheck closed CU-01–CU-10 and identified one residual wording conflict: R5 still said
matched arms. The author replaced it with a paired comparison on the same frozen captures and
incorporated the optional exit-code, absent-envelope and formatting clarifications. The separate
simplification pass confirmed the corrected R5 and exit/envelope wording and found no new
architectural defects. Closure does not claim implementation proof.

Approved-root compatibility with the caller artifact layout remains a named installed integration
gate, not a current capability claim. Grounding/server compatibility, resource use, scenario
quality and supported image-detail pricing require actual authorized runs. These evidence limits
do not justify a second registry, evaluator or broad qualification framework.

See the subsequent [simplification pass](2026-10-06-optional-computer-use-simplification.md).
