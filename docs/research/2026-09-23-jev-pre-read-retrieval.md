---
id: research.jev-pre-read-retrieval-2026-09-23
title: JEV Pre-Read Retrieval Reassessment
type: research
status: current
owner: project-governance
created: 2026-09-23
updated: 2026-09-23
summary: September 23 evidence for testing a bounded, wide metadata selection before source reading or new storage.
---

# JEV pre-read retrieval reassessment — September 23, 2026

## Conclusion

The next experiment is **selection before the source-read cap**, delivered through the normal task
entry. It is not a new database. The current route ranks path terms, inspects at most 256 paths,
seeds at most 32 files, and then asks DL03 about captured excerpts. A useful file outside that pool
cannot be recovered by JEV. The current decision schema also caps a request at 64 questions and
embeds evidence in each question rather than sharing a catalog in the `state`; a 150-path trial is
therefore not a configuration change. A route receipt does not prove the coding model read its packet.
These are separate candidate-generation and host-delivery gaps; a linked evidence store would fix
neither on its own. See [the current task-entry contract](../specs/engine-task-context-entry.md) and
`components/engine/src/context-candidates.ts` / `decision-context-advice.ts`.

This is a design inference from our source and the public experiments below. It is not a measured
accepted-work saving in this runtime. The [RC6 draft](../specs/engine-rc6-linked-retrieval.md) and
[plan](../exec-plans/active/2026-09-23-rc6-linked-retrieval.md) put the inference into a bounded test.
The evidence does not say that JEV will beat a structural repository map for a failure trace, or
that every task needs a wider pool. That is why the deterministic baseline and task-type split matter.

## What changed in the public evidence

| Firsthand source | Result and useful pattern | Limit for our decision |
| --- | --- | --- |
| [TypeSafe skill suggestion](https://docs.typesafe.ai/cookbooks/skill_suggestion), JEV 1.12 run rendered July 31 | One call reads 182 short skill descriptions; a second checks three in detail. Wrong skill loads fell from 16.8% to 7.3% over 488 author-run requests. | A skill roster is more uniform than a source repository. The agent still sometimes ignores a correct suggestion, so prompt advice is not a delivery guarantee. |
| [TypeSafe line search](https://docs.typesafe.ai/cookbooks/semantic_find) | A bounded set of tagged lines can be ranked, with a separate yes/no for whether any answer exists. | `Choice` always selects something. This is a possible second stage after file discovery, not a reason to send whole source files at task entry. |
| [Aera's 400-task offline study](https://aerabrowser.com/news/agent-memory-doesnt-need-a-generator-typesafes-jev-vs-llm-on-400-real-tasks), September 17 | Independent yes/no questions for each candidate worked better than one `Choice` when several memories mattered. A wider pool of 150 plus a second pass gave 46% judged-needs coverage and 72% precision at chat start; the same narrow pool gave 30% coverage and 69% precision. The wide pool itself held 82% of judged needs. | One profile; labels and matching came from models with 79% agreement on shared items. This was offline, not observed agent completion. Its three-item delivery section was a major ceiling. A second pass helped on average but sometimes erased a good first pass. |
| [Coding-agent path study](https://github.com/WanLanglin/jev-skills/blob/main/references/calibration.md), September 2026 | Across 102 search episodes and 4,995 candidate paths, JEV path-only yes/no ranking reached recall@5 0.491 versus search order 0.314. Adding about 400 characters per file gave no reliable improvement on its small paired subset for 3.1 times the input. | “Agent later opened this path” is only a proxy for relevance. JEV still missed 31% of later-opened paths at top 10. Its probabilities were not calibrated for that task, so its thresholds cannot be copied. |
| [Agent Retrieval Bench](https://arxiv.org/html/2607.24882v1), July 27 | A non-JEV benchmark with 427 repository retrieval cases separates test discovery, review context, failure-to-code, change ripple and no-match. No retrieval family led every task or context budget. Logged agents never touched a gold file on 27–35% of selected cases. | This is upstream retrieval evidence, not JEV or patch-success proof. It shows why later-opened files are inadequate gold labels, why a test-only filter can erase root-cause source, and why file and useful-span scores must be separate. |
| [Spring AI TypeSafe integration](https://spring.io/blog/2026/09/21/spring-ai-typesafe-structured-judgment/), September 21 | JEV is wired into existing tool-discovery, document-processing and evaluator interfaces. The tool index adds an independent no-tool-applicable check because `Choice` always has a winner. | This is an integration pattern and live demos, not proof of improved coding outcomes here. Our existing engine and host entry should own the same seams without a new framework. |
| [TypeSafe JEV 1.13 limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13), reviewed September 17 | Irrelevant detail can hurt judgment; exact counts, dates and arithmetic belong in code. Adversarial state can influence answers. | A “whole index” trial must mean approved, bounded *metadata*, not a raw repository, build log or policy dump. Permissions and mandatory evidence remain code-owned. |

The Aera study also found that a larger candidate pool did **not** help its scheduled or delegated
surfaces that already had rich queries. Its chat gain came from a thin initial request. We should
test the wide catalog only for task types whose current candidate pool misses useful material, not
assume every route needs more JEV input. Its published 0.4 threshold was tuned on the evaluated
set, not held out. Our threshold and delivery budget need their own labels.

The coding-agent path study found that a JEV score is more useful as a **read order** than a hard
exclusion. Required sources and exact task-named paths must survive regardless of score. The agent
must be able to expand to originals, and that expansion is a measured miss.

Agent Retrieval Bench found that a path/type filter that helps test discovery can remove every
root-cause source candidate in a failure-to-code task. It also found structural repository maps
strong on failure traces while semantic methods led other tasks. If our path-only trial loses on
failure traces, a compact symbol/import/stack relation is a better next comparison than simply
raising JEV's catalog size. No graph database follows from that finding.

## Smallest experiment that can settle the direction

1. Freeze ordinary, permissioned tasks with known useful files: exact-path, unknown semantic,
   misleading filename, review context, test discovery, failure-to-code, change ripple,
   design/documentation, no-match, and a useful file outside today's first 32 seeds. Record the
   full approved metadata pool and human-reviewed useful-file and useful-span labels; do not use
   “agent opened it” as the only truth. Preserve source/test/document diversity within the approved
   pool; a filter that improves one task type may erase another task's answer.
2. Compare four arms on those same inputs: current route; a wider metadata pool with deterministic
   ranking; the same pool with one JEV yes/no per candidate; and a guarded second content pass only
   if the first pass wins. The JEV arm needs a bounded shared-state request shape and may need
   multiple request batches under our current question cap; measure its full cost and latency. Keep
   the same delivery byte budget and required guidance. Test no-token, deadline, uncertain/no-match
   and changed-source fallback.
3. Measure the pool's ceiling before ranking: was a useful item present at all? Then measure top-k
   useful-file recall, useful excerpts actually delivered, later original reads, host-visible packet
   receipt, total known coding-model input/cached input, accepted outcome, rework and elapsed time.
   Keep missing host use and acceptance as unknown. Do not equate smaller packets or more JEV calls
   with a benefit.
4. Build the pool from existing captured paths and permitted path metadata. If its complete approved
   catalog fits the configured input budget, test that. Otherwise use bounded, recorded partitions
   and deterministic coverage across scopes. Read and digest source only for selected files, using
   the existing immutable-subject owner. No new persistent index is needed for this experiment.

The existing task/evidence links can then be offered as another candidate kind if real tasks show
that missing *prior* evidence causes repeated work. Keep SQLite as task authority and any retrieval
projection rebuildable. The Obsidian-style linked-note idea is a human browsing option, not a
prerequisite for first-read context selection.

For long build logs, a separate firsthand [coding-agent study](https://github.com/WanLanglin/jev-skills/blob/main/references/calibration.md)
found that collapsing repeated line shapes before scoring reduced one 17,591-line log to 24 shapes.
Its simple error/rarity baseline matched JEV for finding the immediate syntax failure; goal-specific
questions benefited more from semantic ranking. This supports a later paired log trial, not a new
always-on classifier or storage system in the first RC6 slice.
