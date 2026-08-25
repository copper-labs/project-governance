"""Dispatch built-in pack ids to direct generic checker entrypoints."""

from __future__ import annotations

import runpy
import sys
from importlib.resources import files
from pathlib import Path


CHECKERS = {
    "format": "check-format.py",
    "naming": "check-naming.py",
    "maintainability": "check-code-smells.py",
    "comments": "check-comments.py",
    "documentation": "check-doc-governance.py",
    "secrets": "check-security-policy.py",
    "dependencies": "check-dependency-freshness.py",
    "test-quality": "check-test-quality.py",
    "context-router": "check-context-router.py",
    "commit-message": "check-commit-message.py",
    "pr-description": "check-pr-description.py",
    "prose": "check-prose-style.py",
    "apple-dependencies": "check-apple-dependencies.py",
}


def _resource_path(*parts: str) -> str:
    """Return one installed default policy, schema, or fixture path."""
    return str(files("project_governance_runtime").joinpath("defaults", *parts))


def _policy_path(relative: str, default_name: str) -> str:
    """Prefer an explicit repository policy and otherwise use the generic package default."""
    target = Path.cwd() / relative
    return str(target) if target.is_file() else _resource_path("policies", default_name)


def _extra_arguments(checker: str) -> list[str]:
    """Supply stable target-owned policy paths required by a direct checker."""
    if checker == "format":
        return ["--json"]
    if checker == "naming":
        return [
            "--policy", _policy_path("config/policies/code-quality.yaml", "code-quality.yaml"),
            "--waivers", _policy_path("config/policies/code-quality-waivers.yaml", "code-quality-waivers.yaml"),
        ]
    if checker == "maintainability":
        return [
            "--policy", _policy_path("config/policies/code-quality.yaml", "code-quality.yaml"),
            "--dispositions", _policy_path("config/policies/code-quality-dispositions.yaml", "code-quality-dispositions.yaml"),
            "--disposition-schema", _resource_path("schemas", "quality-disposition.schema.json"),
        ]
    if checker == "comments":
        return [
            "--policy", _policy_path("config/policies/source-comments.yaml", "source-comments.yaml"),
            "--waivers", _policy_path("config/policies/source-comment-waivers.yaml", "source-comment-waivers.yaml"),
            "--adapters", _policy_path("config/policies/source-comment-adapters.yaml", "source-comment-adapters.yaml"),
            "--policy-schema", _resource_path("schemas", "source-comments.schema.json"),
            "--adapters-schema", _resource_path("schemas", "source-comment-adapters.schema.json"),
            "--waivers-schema", _resource_path("schemas", "source-comment-waivers.schema.json"),
        ]
    if checker == "dependencies":
        return [
            "--policy", _policy_path("config/policies/dependency-freshness.yaml", "dependency-freshness.yaml"),
            "--evidence", "config/policies/dependency-freshness-evidence.yaml",
            "--overrides", "config/policies/dependency-freshness-overrides.yaml",
        ]
    if checker == "apple-dependencies":
        return [
            "--policy", _policy_path("config/policies/apple-dependencies.yaml", "apple-dependencies.yaml"),
            "--exceptions", _policy_path("config/policies/apple-dependency-exceptions.yaml", "apple-dependency-exceptions.yaml"),
            "--exceptions-schema", _resource_path("schemas", "apple-dependency-exception.schema.json"),
        ]
    return []


def main() -> int:
    """Run one packaged checker in-process while retaining its CLI contract."""
    if len(sys.argv) < 2 or sys.argv[1] not in CHECKERS:
        raise SystemExit("usage: python -m project_governance_runtime.checkers <checker> [args]")
    checker = sys.argv[1]
    resource = files("project_governance_runtime").joinpath(
        "checker_scripts", CHECKERS[checker]
    )
    script = Path(str(resource))
    sys.path.insert(0, str(script.parent))
    if checker == "comments":
        import os

        os.environ["PROJECT_GOVERNANCE_COMMENT_FIXTURES"] = _resource_path(
            "fixtures", "comment-quality"
        )
    sys.argv = [str(script), *sys.argv[2:], *_extra_arguments(checker)]
    try:
        runpy.run_path(str(script), run_name="__main__")
    except SystemExit as error:
        return int(error.code or 0)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
