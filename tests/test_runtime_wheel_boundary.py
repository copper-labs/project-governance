#!/usr/bin/env python3
"""Inspect the built wheel for reproducibility and a project-neutral payload."""

from __future__ import annotations

import hashlib
import os
import re
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = ROOT / "src/project_governance_runtime/assets/skills"
SKILLS_ARCHIVE_ROOT = "project_governance_runtime/assets/skills/"
RUNTIME_SKILLS_ROOT = ".governance/runtime/skills/"
FORBIDDEN_PATH_PARTS = (
    "organizational-application",
    "custom-runtime-archive",
    "runtime-ownership-ledger",
    "installation-record",
)
FORBIDDEN_TEXT = ("knowledge graph runtime dependency", "parallel governance runtime mode")
FORBIDDEN_TARGET_IDENTITIES = (
    "/users/example-operator/",
    "example-customer-project",
    "example-internal-product",
    "example-private-adapter",
)
FORBIDDEN_MODEL_INVOCATION_PATTERNS = (
    re.compile(
        r"\b(?:invoke|call|query|prompt)\b[^\n]{0,48}"
        r"\b(?:llm|language model|foundation model|semantic model|openai api|anthropic api|gemini api)\b"
    ),
    re.compile(
        r"\bsend\b[^\n]{0,48}\b(?:source|code|prompt|content)\b[^\n]{0,24}"
        r"\bto\b[^\n]{0,24}\b(?:openai|anthropic|gemini|claude)\b"
    ),
)


def _runtime_relative(path: str) -> str:
    """Convert one installed skill path into its package-relative identity."""
    if not path.startswith(RUNTIME_SKILLS_ROOT):
        raise AssertionError(f"skill path is outside the runtime skill root: {path}")
    return path.removeprefix(RUNTIME_SKILLS_ROOT)


def tracked_skill_files() -> set[str]:
    """Return the live tracked skill assets that a source build can package."""
    result = subprocess.run(
        ["git", "ls-files", "--", str(SKILLS_ROOT.relative_to(ROOT))],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise AssertionError(result.stderr)
    return {
        Path(path).relative_to(SKILLS_ROOT.relative_to(ROOT)).as_posix()
        for path in result.stdout.splitlines()
        if (ROOT / path).is_file()
    }


def declared_skill_files() -> set[str]:
    """Resolve the catalog and manifest-owned runtime payload without a second inventory."""
    catalog = yaml.safe_load((SKILLS_ROOT / "catalog.yaml").read_text(encoding="utf-8"))
    declared = {"catalog.yaml"}
    for section in ("standard_skills", "resources"):
        declared.update(_runtime_relative(item["path"]) for item in catalog[section])
    for section in ("stack_packs", "pattern_packs"):
        for pack in catalog[section]:
            manifest = _runtime_relative(pack["manifest"])
            declared.add(manifest)
            payload = yaml.safe_load((SKILLS_ROOT / manifest).read_text(encoding="utf-8"))
            declared.update(
                _runtime_relative(item["path"])
                for item in payload.get("support_files", [])
            )
            declared.update(
                _runtime_relative(item["path"])
                for item in payload.get("skills", [])
                if item.get("status") == "included"
            )
    return declared


def build_wheel(destination: Path) -> Path:
    """Build with a fixed archive timestamp so identical source yields identical bytes."""
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "wheel",
            ".",
            "--no-build-isolation",
            "--no-deps",
            "--wheel-dir",
            str(destination),
        ],
        cwd=ROOT,
        env={**os.environ, "SOURCE_DATE_EPOCH": "946684800"},
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise AssertionError(result.stdout + result.stderr)
    wheels = list(destination.glob("project_governance_runtime-*.whl"))
    if len(wheels) != 1:
        raise AssertionError(f"expected one runtime wheel, found {wheels}")
    return wheels[0]


class RuntimeWheelBoundaryTests(unittest.TestCase):
    """Keep the release artifact deterministic, generic, and free of retired machinery."""

    def test_skill_payload_is_catalog_or_manifest_owned(self) -> None:
        """Require every shipped skill asset to have one discovery or support owner."""
        self.assertEqual(tracked_skill_files(), declared_skill_files())

    def test_wheel_is_reproducible_and_allowlisted(self) -> None:
        """Compare exact bytes and inspect archive paths plus textual payload."""
        self.assertFalse((ROOT / "template").exists())
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            first_wheel = build_wheel(Path(first))
            second_wheel = build_wheel(Path(second))
            self.assertEqual(
                hashlib.sha256(first_wheel.read_bytes()).hexdigest(),
                hashlib.sha256(second_wheel.read_bytes()).hexdigest(),
            )
            with zipfile.ZipFile(first_wheel) as archive:
                names = archive.namelist()
                packaged_skills = {
                    name.removeprefix(SKILLS_ARCHIVE_ROOT)
                    for name in names
                    if name.startswith(SKILLS_ARCHIVE_ROOT) and not name.endswith("/")
                }
                self.assertEqual(packaged_skills, declared_skill_files())
                self.assertTrue(
                    all(
                        name.startswith("project_governance_runtime/")
                        or ".dist-info/" in name
                        for name in names
                    )
                )
                lowered_names = "\n".join(names).lower()
                for forbidden in FORBIDDEN_PATH_PARTS:
                    self.assertNotIn(forbidden, lowered_names)
                text = "\n".join(
                    archive.read(name).decode("utf-8", errors="ignore")
                    for name in names
                ).lower()
                for forbidden in FORBIDDEN_TEXT:
                    self.assertNotIn(forbidden, text)
                for forbidden in FORBIDDEN_TARGET_IDENTITIES:
                    self.assertNotIn(forbidden, text)
                for forbidden in FORBIDDEN_MODEL_INVOCATION_PATTERNS:
                    self.assertIsNone(forbidden.search(text), forbidden.pattern)


if __name__ == "__main__":
    unittest.main()
