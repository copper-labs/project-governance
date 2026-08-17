---
name: risk-assessment
description: Use when evaluating implementation, architecture, security, release, migration, compliance, operational, or schedule risk before changing code or process.
---

# Risk Assessment

## Trigger

Use this skill before high-impact implementation, public API changes, architecture changes, migrations, security/trust changes, releases, or when the user asks for risk, confidence, or readiness.

## Required Reads

- `AGENTS.md`
- relevant architecture/spec/decision docs
- repository profile validation, security, release, and platform sections
- current diff or planned scope when available
- known incidents, flaky checks, or release notes for the affected area

## Workflow

1. Define the change or decision under review.
2. Identify risk categories: correctness, security, privacy, data, licensing, platform compatibility, performance, operability, migration, release, and user impact.
3. Rate likelihood and impact using simple labels: low, medium, high, critical.
4. Name triggers that would increase risk, and mitigations that lower it.
5. Distinguish blocking risks from advisory risks and accepted tradeoffs.
6. Recommend go, go with mitigations, pause for more evidence, or do not proceed.

## Validation

Cross-check risks against target profile gates and required validation packs. For security, legal, medical, financial, or version-sensitive platform claims, verify current primary sources before finalizing.

## Evidence

Report the risk table, blocking items, mitigations, residual risk, validation needed, and final readiness recommendation.
