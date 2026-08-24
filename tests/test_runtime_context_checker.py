#!/usr/bin/env python3
"""Exercise the packaged checker against the direct context resolver contract."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
CHECKERS = ROOT / "src/project_governance_runtime/checker_scripts"
DEFAULTS = ROOT / "src/project_governance_runtime/defaults"
CONTEXT_CHECKER_SOURCES = (
    "check-context-router.py",
    "context_check_profile.py",
)


def checker_environment() -> dict[str, str]:
    """Run the source-tree executable with the package import path available."""
    existing = os.environ.get("PYTHONPATH", "")
    return {**os.environ, "PYTHONPATH": os.pathsep.join(filter(None, [str(ROOT / "src"), existing]))}


def run_checker(root: Path) -> subprocess.CompletedProcess[str]:
    """Run the context checker exactly as its direct pack command does."""
    return subprocess.run(
        [sys.executable, str(CHECKERS / "check-context-router.py")],
        cwd=root,
        env=checker_environment(),
        text=True,
        capture_output=True,
        check=False,
    )


def write_yaml(path: Path, value: object) -> None:
    """Write one child-owned fixture configuration document."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(value), encoding="utf-8")


class RuntimeContextCheckerTests(unittest.TestCase):
    """Protect the lean checker without retaining packet or provider machinery."""

    def test_context_checker_sources_have_no_blocking_complexity_findings(self) -> None:
        """Apply the package maintainability policy to the two owned checker sources."""
        findings = []
        for source in CONTEXT_CHECKER_SOURCES:
            result = subprocess.run(
                [
                    sys.executable,
                    str(CHECKERS / "check-code-smells.py"),
                    "--path",
                    str(CHECKERS / source),
                    "--policy",
                    str(DEFAULTS / "policies/code-quality.yaml"),
                    "--dispositions",
                    str(DEFAULTS / "policies/code-quality-dispositions.yaml"),
                    "--disposition-schema",
                    str(DEFAULTS / "schemas/quality-disposition.schema.json"),
                ],
                cwd=ROOT,
                env=checker_environment(),
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            findings.extend(json.loads(result.stdout)["findings"])
        blocking_complexity = [
            finding
            for finding in findings
            if finding["severity"] == "blocking"
            and finding["rule_id"] in {"quality.high-cyclomatic", "quality.high-cognitive", "quality.deep-nesting"}
        ]
        self.assertEqual(blocking_complexity, [])

    def test_unconfigured_child_passes_without_context_files(self) -> None:
        """Keep the minimal initialized child free of context-router requirements."""
        with tempfile.TemporaryDirectory() as directory:
            result = run_checker(Path(directory))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {"finding_count": 0, "findings": [], "status": "passed"})

    def test_unconfigured_child_validates_optional_skill_context_facts(self) -> None:
        """Validate fact-only configuration without forcing a profile or router into the child."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_yaml(
                root / "config/governance/facts.lock.yaml",
                {
                    "schema_version": 1,
                    "facts": {
                        "skill_context": {
                            "ecosystems": "kmp",
                            "unknown_shape": ["phone"],
                        }
                    },
                },
            )
            result = run_checker(root)
        payload = json.loads(result.stdout)
        self.assertEqual(result.returncode, 1)
        self.assertTrue(any("ecosystems: expected a list" in item for item in payload["findings"]))
        self.assertTrue(any("unknown_shape: unsupported field" in item for item in payload["findings"]))

    def test_unconfigured_child_accepts_well_formed_optional_skill_context_facts(self) -> None:
        """Keep the additive facts block independent from router adoption."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_yaml(
                root / "config/governance/facts.lock.yaml",
                {
                    "schema_version": 1,
                    "facts": {
                        "skill_context": {
                            "ecosystems": ["kmp"],
                            "target_families": ["android", "apple"],
                            "device_topology": ["companion"],
                        }
                    },
                },
            )
            result = run_checker(root)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_configured_router_validates_direct_files_budgets_skills_and_packs(self) -> None:
        """Reject only unsafe or unresolved references from the active resolver shape."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "docs/governance").mkdir(parents=True)
            (root / "docs/governance/guide.md").write_text("guide\n", encoding="utf-8")
            write_yaml(
                root / "config/governance/profile.yaml",
                {
                    "profile_id": "sample",
                    "context_router": {
                        "default_context": ["docs/governance/missing.md"],
                        "default_skills": ["../unsafe"],
                        "routes": [
                            {
                                "id": "duplicate",
                                "primary_context": ["docs/governance/guide.md"],
                                "token_budget": {"primary_context_tokens": 30, "total_context_tokens": 20},
                                "validations": ["not-a-pack"],
                            },
                            {"id": "duplicate", "active_plan_context": ["../outside.md"]},
                        ],
                    },
                },
            )
            write_yaml(root / "config/governance/facts.lock.yaml", {"profile_id": "other", "facts": {}})
            result = run_checker(root)
        payload = json.loads(result.stdout)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(payload["status"], "failed")
        self.assertTrue(any("path does not name" in finding for finding in payload["findings"]))
        self.assertTrue(any("unsafe skill" in finding for finding in payload["findings"]))
        self.assertTrue(any("duplicate route id" in finding for finding in payload["findings"]))
        self.assertTrue(any("must not exceed total" in finding for finding in payload["findings"]))
        self.assertTrue(any("unknown pack not-a-pack" in finding for finding in payload["findings"]))
        self.assertTrue(any("identify different repositories" in finding for finding in payload["findings"]))
        self.assertEqual(payload["finding_count"], len(payload["findings"]))

    def test_configured_router_accepts_direct_resolver_shape(self) -> None:
        """Accept a configured route without packet fixtures, generated docs, or provider state."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            guide = root / "docs/governance/guide.md"
            guide.parent.mkdir(parents=True)
            guide.write_text("guide\n", encoding="utf-8")
            write_yaml(
                root / "config/governance/profile.yaml",
                {
                    "profile_id": "sample",
                    "context_router": {
                        "default_context": ["docs/governance/guide.md"],
                        "default_skills": ["work"],
                        "routes": [
                            {
                                "id": "governance",
                                "match": {"prompt_terms": ["governance"]},
                                "primary_context": ["docs/governance/guide.md"],
                                "validations": ["documentation"],
                            }
                        ],
                    },
                },
            )
            write_yaml(root / "config/governance/facts.lock.yaml", {"profile_id": "sample", "facts": {}})
            result = run_checker(root)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {"finding_count": 0, "findings": [], "status": "passed"})


if __name__ == "__main__":
    unittest.main()
