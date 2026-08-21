#!/usr/bin/env python3
"""Prove minimal documentation installation and exact catalog routing."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from project_governance_runtime.documentation import (  # noqa: E402
    DocumentationError,
    documentation_issues,
    initialize_documentation,
    route_documentation,
)


def profile_text(root_path: str = "docs/developer", *, enabled: bool = True) -> str:
    """Return one enabled documentation profile fixture."""
    return yaml.safe_dump(
        {
            "schema_version": 1,
            "project_extensions": [],
            "documentation": {
                "enabled": enabled,
                "root": root_path,
                "research": "allowed",
            },
        },
        sort_keys=False,
    )


def write_profile(root: Path, root_path: str = "docs/developer", *, enabled: bool = True) -> None:
    """Write one target-owned profile fixture."""
    path = root / "config/governance/profile.yaml"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(profile_text(root_path, enabled=enabled), encoding="utf-8")


def write_capability_catalog(root: Path, records: list[dict[str, object]]) -> None:
    """Replace the initialized catalog with exact test records."""
    path = root / "docs/developer/catalog.yaml"
    path.write_text(
        yaml.safe_dump({"version": 1, "capabilities": records}, sort_keys=False),
        encoding="utf-8",
    )


def capability(root: Path, identifier: str = "first-check") -> dict[str, object]:
    """Create the files and return one minimal routed capability."""
    reference = root / f"docs/developer/reference/{identifier}.md"
    guide = root / f"docs/developer/guides/{identifier}.md"
    source = root / "src/runtime.py"
    reference.write_text(f"# {identifier} reference\n", encoding="utf-8")
    guide.write_text(f"# {identifier} guide\n", encoding="utf-8")
    source.parent.mkdir(parents=True, exist_ok=True)
    source.write_text("# runtime\n", encoding="utf-8")
    return {
        "id": identifier,
        "title": "Run the first check",
        "aliases": [f"{identifier}-alias"],
        "tasks": ["run one check"],
        "symbols": [f"{identifier}-symbol"],
        "reference": reference.relative_to(root).as_posix(),
        "guides": [guide.relative_to(root).as_posix()],
        "sources": [source.relative_to(root).as_posix()],
        "project_extension": {"retained": True},
    }


class RuntimeDocumentationSystemTests(unittest.TestCase):
    """Keep the optional module small, safe, and useful to humans and agents."""

    def test_init_previews_applies_and_repeats_without_overwrite(self) -> None:
        """Install the neutral structure once and preserve profile text on repeated use."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            existing = "schema_version: 1\nproject_extensions: []\n# project comment\n"
            profile = root / "config/governance/profile.yaml"
            profile.parent.mkdir(parents=True)
            profile.write_text(existing, encoding="utf-8")

            preview = initialize_documentation(root, dry_run=True)
            self.assertEqual(preview["status"], "dry-run")
            self.assertFalse((root / "docs/developer").exists())
            self.assertEqual(profile.read_text(encoding="utf-8"), existing)

            first = initialize_documentation(root)
            installed_profile = profile.read_text(encoding="utf-8")
            second = initialize_documentation(root)

        self.assertEqual(first["status"], "initialized")
        self.assertEqual(second["status"], "unchanged")
        self.assertIn("documentation:\n", installed_profile)
        self.assertTrue(installed_profile.startswith(existing))
        self.assertEqual(second["created"], [])
        self.assertEqual(second["updated"], [])
        self.assertIn("docs/developer/catalog.yaml", second["unchanged"])

    def test_init_respects_custom_root_and_disabled_profile(self) -> None:
        """Use the adopter's root while treating an explicit disable as authoritative."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_profile(root, "documentation/developers")
            result = initialize_documentation(root)
            self.assertEqual(result["status"], "initialized")
            self.assertTrue((root / "documentation/developers/catalog.yaml").is_file())

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_profile(root, enabled=False)
            result = initialize_documentation(root)
            self.assertEqual(result["status"], "disabled")
            self.assertFalse((root / "docs/developer").exists())

    def test_init_stops_on_conflict_traversal_and_symlink_escape(self) -> None:
        """Fail before overwriting an incompatible path or escaping the repository."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_profile(root)
            conflict = root / "docs/developer/index.md"
            conflict.mkdir(parents=True)
            result = initialize_documentation(root)
            self.assertEqual(result["status"], "failed")
            self.assertEqual(result["conflicts"], ["docs/developer/index.md"])
            self.assertEqual(result["created"], [])
            self.assertEqual(result["updated"], [])
            self.assertFalse((root / "docs/developer/catalog.yaml").exists())

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_profile(root, "../outside")
            with self.assertRaisesRegex(DocumentationError, "repository-relative"):
                initialize_documentation(root)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_profile(root, str(root / "absolute"))
            with self.assertRaisesRegex(DocumentationError, "repository-relative"):
                initialize_documentation(root)

        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as external:
            root = Path(directory)
            write_profile(root)
            (root / "docs").symlink_to(Path(external), target_is_directory=True)
            with self.assertRaisesRegex(DocumentationError, "symlinks are not allowed"):
                initialize_documentation(root)

    def test_init_rejects_root_file_in_preview_and_writes_profile_last(self) -> None:
        """Keep previews executable and leave an inert structure if profile activation fails."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_profile(root)
            target = root / "docs/developer"
            target.parent.mkdir(parents=True)
            target.write_text("not a directory\n", encoding="utf-8")
            preview = initialize_documentation(root, dry_run=True)
            applied = initialize_documentation(root)
            self.assertEqual(preview["status"], "failed")
            self.assertEqual(applied["status"], "failed")
            self.assertEqual(preview["conflicts"], ["docs/developer"])

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch(
                "project_governance_runtime.documentation.atomic_write_text",
                side_effect=OSError("profile write failed"),
            ):
                with self.assertRaisesRegex(OSError, "profile write failed"):
                    initialize_documentation(root)
            self.assertTrue((root / "docs/developer/index.md").is_file())
            self.assertFalse((root / "config/governance/profile.yaml").exists())

    def test_exact_routes_share_one_record_and_reject_fuzzy_matches(self) -> None:
        """Resolve ids, aliases, and symbols without interpreting natural language."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize_documentation(root)
            record = capability(root)
            write_capability_catalog(root, [record])

            by_id = route_documentation(root, capability="first-check")
            by_alias = route_documentation(root, capability="first-check-alias")
            by_symbol = route_documentation(root, symbol="first-check-symbol")
            fuzzy = route_documentation(root, capability="first")

        for result in (by_id, by_alias, by_symbol):
            self.assertEqual(result["status"], "matched")
            self.assertEqual(result["capability"]["project_extension"], {"retained": True})
            self.assertEqual(
                result["context_paths"],
                [
                    "docs/developer/reference/first-check.md",
                    "docs/developer/guides/first-check.md",
                    "src/runtime.py",
                ],
            )
        self.assertEqual(fuzzy["status"], "not-found")

    def test_routes_surface_ambiguity_invalid_catalog_and_disabled_module(self) -> None:
        """Return bounded terminal states instead of guessing around target defects."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize_documentation(root)
            first = capability(root, "one")
            second = capability(root, "two")
            first["symbols"] = ["shared"]
            second["symbols"] = ["shared"]
            write_capability_catalog(root, [first, second])
            ambiguous = route_documentation(root, symbol="shared")
            issues = documentation_issues(root)
            (root / "docs/developer/reference/one.md").unlink()
            degraded = route_documentation(root, capability="one")
            missing_issues = documentation_issues(root)
            (root / "docs/developer/catalog.yaml").write_text(
                "version: [invalid]\n", encoding="utf-8"
            )
            invalid = route_documentation(root, capability="one")

        self.assertEqual(ambiguous["status"], "ambiguous")
        self.assertEqual(ambiguous["match_count"], 2)
        self.assertTrue(any("shared" in issue for issue in issues))
        self.assertEqual(degraded["status"], "matched")
        self.assertTrue(any("target is missing" in issue for issue in missing_issues))
        self.assertEqual(invalid["status"], "invalid")
        self.assertNotIn("capability", invalid)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_profile(root, enabled=False)
            disabled = route_documentation(root, capability="anything")
        self.assertEqual(disabled["status"], "disabled")

    def test_route_rejects_symlinked_catalog_and_exposes_research_policy(self) -> None:
        """Reject catalog indirection while giving the authoring host the adopter policy."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize_documentation(root)
            profile = root / "config/governance/profile.yaml"
            profile.write_text(
                profile.read_text(encoding="utf-8").replace(
                    "research: allowed", "research: disabled"
                ),
                encoding="utf-8",
            )
            catalog = root / "docs/developer/catalog.yaml"
            target = root / "catalog-target.yaml"
            catalog.replace(target)
            catalog.symlink_to(target)
            invalid = route_documentation(root, capability="anything")
            catalog.unlink()
            target.replace(catalog)
            routed = route_documentation(root, capability="anything")

        self.assertEqual(invalid["status"], "invalid")
        self.assertEqual(routed["status"], "not-found")
        self.assertEqual(routed["research"], "disabled")

    def test_route_rejects_catalog_paths_outside_the_repository(self) -> None:
        """Keep exact context routes repository-contained even when evidence is missing."""
        for reference in ("../../outside.md", "/etc/hosts"):
            with self.subTest(reference=reference), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                initialize_documentation(root)
                write_capability_catalog(
                    root,
                    [
                        {
                            "id": "unsafe",
                            "title": "Unsafe",
                            "reference": reference,
                        }
                    ],
                )
                routed = route_documentation(root, capability="unsafe")
            self.assertEqual(routed["status"], "invalid")
            self.assertNotIn("capability", routed)

    def test_cli_telemetry_does_not_retain_the_route_query(self) -> None:
        """Observe command outcomes while discarding private catalog identifiers and paths."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            command = [sys.executable, "-m", "project_governance_runtime.cli"]
            environment = {**os.environ, "PYTHONPATH": str(ROOT / "src")}
            initialized = subprocess.run(
                [*command, "docs", "init"],
                cwd=root,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(initialized.returncode, 0, initialized.stderr)
            record = capability(root, "private-capability")
            write_capability_catalog(root, [record])
            routed = subprocess.run(
                [
                    *command,
                    "docs",
                    "route",
                    "--symbol",
                    "private-capability-symbol",
                    "--json",
                ],
                cwd=root,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            telemetry = (root / ".governance/telemetry/runs.jsonl").read_text(
                encoding="utf-8"
            )
            output = json.loads(routed.stdout)

        self.assertEqual(routed.returncode, 0, routed.stderr)
        self.assertEqual(output["status"], "matched")
        self.assertNotIn("private-capability", telemetry)
        self.assertNotIn("docs/developer", telemetry)
        self.assertIn('"query_kind": "symbol"', telemetry)

    def test_cli_route_statuses_have_stable_text_and_exit_contracts(self) -> None:
        """Reserve failure exits for broken input while keeping routine lookup states scriptable."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize_documentation(root)
            command = [sys.executable, "-m", "project_governance_runtime.cli"]
            environment = {**os.environ, "PYTHONPATH": str(ROOT / "src")}
            not_found = subprocess.run(
                [*command, "docs", "route", "--capability", "missing"],
                cwd=root,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            (root / "docs/developer/catalog.yaml").write_text(
                "version: [invalid]\n", encoding="utf-8"
            )
            invalid = subprocess.run(
                [*command, "docs", "route", "--symbol", "missing"],
                cwd=root,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertEqual(not_found.returncode, 0, not_found.stderr)
        self.assertEqual(
            not_found.stdout.strip(),
            "status=not-found query_kind=capability match_count=0",
        )
        self.assertEqual(invalid.returncode, 1, invalid.stderr)
        self.assertEqual(
            invalid.stdout.strip(), "status=invalid query_kind=symbol match_count=0"
        )

    def test_cli_records_failed_init_without_repository_content(self) -> None:
        """Retain a bounded failure outcome when initialization rejects the local profile."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            profile = root / "config/governance/profile.yaml"
            profile.parent.mkdir(parents=True)
            profile.write_text("documentation: [invalid]\n", encoding="utf-8")
            command = [sys.executable, "-m", "project_governance_runtime.cli"]
            environment = {**os.environ, "PYTHONPATH": str(ROOT / "src")}
            initialized = subprocess.run(
                [*command, "docs", "init"],
                cwd=root,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            telemetry = (root / ".governance/telemetry/runs.jsonl").read_text(
                encoding="utf-8"
            )
            output = json.loads(initialized.stdout)

        self.assertEqual(initialized.returncode, 1)
        self.assertEqual(output["kind"], "project-governance-documentation-init")
        self.assertEqual(output["version"], 1)
        self.assertEqual(output["created"], [])
        self.assertEqual(output["conflicts"], [])
        self.assertIn('"outcome": "failed"', telemetry)
        self.assertNotIn("invalid", telemetry)


if __name__ == "__main__":
    unittest.main()
