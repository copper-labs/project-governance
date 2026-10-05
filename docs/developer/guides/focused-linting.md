---
id: developer.focused-linting
title: Adopt Focused Deterministic Linting
type: guide
status: current
owner: project-governance
created: 2026-10-05
updated: 2026-10-05
summary: Adopts captured-candidate lint packs with real Ruff and ESLint backends, visible setup states and narrow batch checks.
---

# Adopt focused deterministic linting

The next major runtime uses project-owned packs to run established lint tools. No LLM or JEV
classifies files, runs lint or decides whether an adopted check passed. Existing rules remain owned
by the project; narrow changes do not trigger repository-wide formatting or a generated debt baseline.

## Set up once

Inspect the proposal before applying it:

```sh
project-governance lint setup
project-governance lint setup --root src --include-dependencies
```

The proposal names detected roots, existing configuration, exact tool versions, missing dependencies,
files and required stages. The qualified backends use Ruff **0.15.14** for Python and ESLint
**9.39.1** for JavaScript/TypeScript. The TypeScript starter uses `@typescript-eslint/parser`
**8.46.4**. Other tool versions need explicit qualification; setup does not downgrade existing pins.
Other stacks can declare a project-owned captured-input pack or an explicit root exclusion with a
reason. Ambiguous configuration and unsupported execution modes need deliberate reconciliation.

Apply the same accepted options and returned digest:

```sh
project-governance lint setup --root src --include-dependencies --apply --plan-digest <returned-digest>
```

This writes the accepted config, pack and profile changes. Optional dependency declarations remain
project-local. It does not download packages, execute scripts, run checks or commit. Acquire tools
once through the project's normal package manager, then inspect readiness:

```sh
project-governance doctor --capability lint
```

Dependency-enabled setup in a new npm project declares its future `package-lock.json` input but
does not create it. Readiness stays `needs-setup` until explicit package acquisition supplies the
lock and tools. When that lock appears, setup can repeat without changing the accepted pack.
Existing pnpm and Yarn locks remain selected inputs. A newly declared non-npm package manager
without a lock needs deliberate lock-input selection; setup does not infer an npm lock for it.

Fresh next-major installations start empty and require coverage before their first recognized source
change. Existing installations without a lint section report `not-adopted` until deliberate setup;
an adopted obligation remains blocking if its pack disappears or becomes unavailable.

## Use the normal batch boundary

Finish one coherent implementation batch and its regression cases, then run the declared impacted
check. Normal pre-commit and adopted integration stages retain required lint coverage. Explicit pack
selection cannot omit an applicable required owner. Do not add per-edit or prompt-triggered lint.

The adapter reads the same captured candidate as the check runner, including staged source and
declared configuration inputs. Opposing live checkout bytes cannot replace those inputs. Config or
lock changes widen the affected backend scope. Deleted and renamed files retain their owner impact.
Complete originals, tool identity, input hashes and process cleanup remain in the native receipt.

The first adapters qualify file-local rules and declarative config. Dynamic or type-aware modes whose
dependencies cannot be captured stay `needs-setup`; green output cannot conceal that limit. Native
violations and infrastructure failures remain distinct. Repair a group of related findings, then
recheck only its affected owners unless broader proof has a declared reason.
