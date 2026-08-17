---
name: test-driven-development
description: Use for behavior-first implementation where tests can express the intended contract before or alongside code. Supports red-green-refactor with repository profile validation.
---

# Test-Driven Development

## Trigger

Use this skill when implementing a behavior change, bug fix, parser, state machine, public API contract, data transformation, or regression that can be captured by deterministic tests.

## Required Reads

- `AGENTS.md`
- governing requirement, bug report, or spec
- existing tests and fixtures for the touched area
- repository profile validation packs and platform profiles

## Workflow

1. Define the behavior in one or more small test cases, including edge cases and failure cases.
2. Run the test to see it fail for the right reason when practical.
3. Implement the smallest change that makes the test pass.
4. Run the targeted test, then nearby tests, then impact-selected validation packs.
5. Refactor for clarity while tests stay green.
6. Add regression evidence to the closeout or PR notes.

## Validation

Run targeted tests first, then impacted lint/format/code-quality/boundary checks, then broader tests when shared contracts or platform behavior changed.

## Evidence

Report tests added or updated, initial failure evidence when available, implementation scope, final validation, and behavior risks not covered by tests.
