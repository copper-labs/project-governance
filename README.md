# Project Governance Runtime

`project-governance` is a small, project-neutral runtime for selecting and running the checks
affected by a repository change. Markdown remains the active authority for governance decisions,
plans, and documentation. Git history is the recovery record for removed implementation.

The runtime is distributed as the standard Python wheel `project-governance-runtime`. The wheel
contains generic planning, execution, normalization, telemetry, built-in checks, schemas, and
shared skills. A project keeps only its own profile, facts, extension packs, documentation, and
thin hooks.

## Use It In A Project

Initialize the small project-owned surface once:

```sh
project-governance init
```

After the project maintainer writes its exact runtime lock, bootstrap installs that one wheel into
the ignored local environment. Hooks never download or change the lock themselves.

```sh
python3 tools/governance-bootstrap.py
project-governance doctor
project-governance plan --stage pre-commit --mode impacted --json
project-governance check --stage pre-commit --mode impacted
project-governance check --pack naming
project-governance docs init --dry-run
project-governance docs route --capability <id> --json
project-governance telemetry status
```

An intentional runtime adoption is explicit:

```sh
project-governance update --to <version> --dry-run
project-governance update --to <version> --apply
```

An update changes the project lock only when its configuration schema remains compatible. A
project-owned configuration decision is never inferred or overwritten. Publishing a wheel is a
separate remote action and requires explicit authorization.

Stable releases use matching semantic tags and package versions such as `1.0.0`, `1.1.0`, and
`1.1.1`. Untagged source builds retain commit identity as development versions; hashes no longer
appear in GitHub release names. See the [release process](docs/governance/release-process.md).

## What The Runtime Guarantees

- Impacted mode maps changed paths to the smallest applicable pack set and reports any unmapped
  path as one clear blocker.
- Explicit pack execution, dependencies, operator- or target-supplied timeouts, cancellation,
  normalized findings, stable exit codes, JSON output, and bounded local telemetry are built in.
- Built-in checks cover formatting, naming, maintainability, comments, documentation, secrets,
  dependencies, test quality, and commit messages. Projects add only their own extension packs.
- Generic skills are materialized from the installed wheel into ignored local discovery state;
  project-specific skills stay tracked by that project.
- An optional minimal developer-documentation structure gives humans and agents one catalog and
  canonical corpus while the host agent owns local-first, research-enabled authoring.
- Product identities, paths, adapters, release evidence, and project-specific vocabulary do not
  belong in this repository or its wheel.

## Source Development

Source development supports Python `>=3.9,<4`.

```sh
python3 -m pip install -r requirements-dev.txt
tools/run-source-governance.sh plan --stage pre-commit --mode impacted --json
tools/run-source-governance.sh check --stage pre-commit --mode impacted --staged
python3 -m pip wheel . --no-deps --wheel-dir dist
python3 tools/verify-runtime-wheel.py dist/project_governance_runtime-*.whl
```

Source hooks use the checkout package directly so they validate the code being changed. Installed
project hooks use their locked local wheel instead.

## Reference

- [Documentation index](docs/index.md)
- [Developer documentation](docs/developer/index.md)
- [Charter](CHARTER.md)
- [Execution plans](docs/exec-plans/README.md)
- [Future knowledge-graph direction](docs/proposed/knowledge-graph/README.md)
