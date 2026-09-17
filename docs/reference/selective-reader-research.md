---
id: reference.selective-reader-research
title: Research Basis For Selective Reader Delegation
type: reference
status: current
owner: project-governance
created: 2026-09-06
updated: 2026-09-06
summary: Records evidence and limits behind one writer with zero to two bounded readers.
---

# Research Basis For Selective Reader Delegation

The policy selects small, useful teams; it does not claim that three agents or a particular model
mix is a demonstrated optimum. These sources were reviewed as of September 6, 2026. Their results
motivate task decomposition and cost discipline, not numerical guarantees for this runtime.

| Evidence | Finding and limitation | Policy implication |
| --- | --- | --- |
| [Google Research, January 2026](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/) | Across 180 configurations, task structure determined whether coordination helped. Sequential planning suffered; these were broader agent benchmarks, not a trial of this coding policy. | Keep dependent implementation with one writer; delegate independent questions. |
| [Tokenomics, January 2026](https://arxiv.org/abs/2601.14470) | Iterative code review averaged 59.4% of tokens in 30 ChatDev/GPT-5 tasks. One framework and model limit generalization. | Avoid continuous review conversations and repeated context transfer; retain one approval review per batch. |
| [Agent diversity, February 2026](https://arxiv.org/abs/2602.03794) | Two diverse agents could match or exceed 16 similar agents on small-model reasoning benchmarks. This does not establish a repository-coding team size or model mix. | Give readers distinct questions and evidence sources rather than duplicate generalist assignments. |
| [Equal thinking budgets, April 2026](https://arxiv.org/abs/2604.02460) | Single agents matched or beat multi-agent approaches on multi-hop reasoning at equal reasoning-token budgets. These were not implementation batches. | Compare all-agent usage and equivalent quality; faster parallel execution alone does not prove efficiency. |
| [Anthropic, August 2026](https://www.anthropic.com/research/multiagent-systems) | Bounded input/output assignments were more tractable than loosely coordinated long-lived peers. Same-scope vulnerability comparisons narrowed a large swarm's apparent advantage. | Use bounded assignments and one reconciling primary, without inferring value from agent or finding counts. |
| [Task specifications, August 2026](https://arxiv.org/abs/2608.25399) | Across 2,700 runs on five tasks with one model, bare user stories raised cost by 29.7% versus detailed specifications. This is preliminary and task-dependent. | Supply enough concrete constraints and references to avoid rediscovery; a short but ambiguous brief is not efficient. |

## Calibration Boundary

The ceiling of two readers and initial target of less than 25% median token premium are operating
choices to evaluate, not research constants. A meaningful comparison holds task, starting snapshot,
writer settings, acceptance checks, and environment comparable across zero, one, and two readers.
Count the orchestrator, writer, reader, review, and repair work consistently in every condition.
Inspect both median outcomes and expensive outliers; preserve failures rather than measuring only
successful runs. Repeat noisy cases before attributing differences to delegation.

Use existing provider usage and command records. Distinguish fresh/cached input, output/reasoning,
elapsed time, and actual monetary cost. Never count reasoning twice when it is included in output.
No new collector, routine benchmark, or runtime spending gate is required. Missing usage cannot
establish compliance with the target. Shipping guidance does not establish measured savings.

## Behavioral Checks

Before claiming the guidance works in a host, inspect a small set of representative assignments:

- A direct edit with no independent uncertainty should remain solo.
- A coherent implementation with an independent caller or contract question should use one reader
  while useful implementation continues.
- Two independent questions may justify two readers; a third parallel investigation remains deferred.
- A long build without a useful question must not create busywork or duplicate the build.
- A reader on changing files must label its basis and avoid shared-state writes; its advice is not
  final approval.
- A completed batch receives one applicable independent approval review with existing proof.

These are review scenarios, not deterministic evidence that a model will always follow a prompt.
The installed delegated-execution skill owns the operational rule; this reference is its rationale.
