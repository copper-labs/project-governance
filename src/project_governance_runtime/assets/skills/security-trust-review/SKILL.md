---
id: skill.security-trust-review
title: Security Trust Review
stage: Review
provenance: package-default
---

# Security Trust Review

Review security, trust, dependency freshness, and supply-chain risk before handoff.

## Trigger

Use this skill when changes touch secrets, permissions, signing, entitlement policy, dependency
manifests, CI actions, build plugins, generated governance, release tooling, or protected packs.

## Required Reads

- `AGENTS.md`
- `docs/index.md`
- `docs/governance/dependency-freshness-policy.md`
- `docs/governance/validation-strategy.md`
- `.governance/runtime/skills/review-finding.schema.yaml`
- repository profile security and dependency validation packs

## Workflow

1. Identify security-sensitive files, workflows, credentials, generated config, and dependency
   changes.
2. Check dependency freshness evidence and any operator override records.
3. Review permissions, trust boundaries, secret exposure, signing, release, and supply-chain risks.
4. Format findings with the shared review finding schema.
5. Require high and medium findings to be fixed, rechecked, or accepted with explicit risk.

## Validation

Consume existing subject-valid security and dependency proof. Run only the configured owner for a
named uncovered claim; do not replay every security, conformance, and release pack as a review
matrix. If evidence is unavailable, record the gap as residual risk.

## Evidence

Report findings with severity, location, risk, recommendation, and evidence. Include validation
commands, override records, and residual security risk.
