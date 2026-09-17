#!/usr/bin/env python3
"""Prove notice preservation is exact and uses the governed validation subject."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = "config/policies/format-preserved-notices.json"
NOTICE = b"Upstream notice  \r\nAll rights reserved.\r\n"


class RuntimeFormatPreservationTests(unittest.TestCase):
    """Exercise the public packaged formatter with real files and immutable packets."""

    def setUp(self) -> None:
        """Create an isolated adopter with no inherited packet environment."""
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.environment = {
            key: value for key, value in os.environ.items()
            if not key.startswith("PROJECT_GOVERNANCE_CHANGE_PACKET")
        }
        self.environment["PYTHONPATH"] = str(ROOT / "src")

    def write(self, path: str, content: bytes) -> None:
        """Materialize fixture bytes without newline conversion."""
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)

    def registry(self, path: str = "vendor/LICENSE") -> None:
        """Record reviewed fixture provenance and its exact content identity."""
        self.write(REGISTRY, json.dumps({"version": 1, "notices": [{
            "path": path,
            "sha256": hashlib.sha256(NOTICE).hexdigest(),
            "source": "https://example.org/upstream/v1/LICENSE",
        }]}).encode())

    def run_format(self, *paths: str, packet: dict | None = None, all_mode: bool = False) -> tuple[int, dict]:
        """Run replay selection or a runtime packet through packaged dispatch."""
        if all_mode:
            args = ["--all"]
        elif packet is None:
            self.write("selection.json", json.dumps({
                "selectedInputs": [{"path": path} for path in paths],
            }).encode())
            args = ["--governance-selection-file", "selection.json"]
        else:
            self.write("packet.json", json.dumps(packet).encode())
            self.environment["PROJECT_GOVERNANCE_CHANGE_PACKET"] = str(self.root / "packet.json")
            args = ["--staged"]
        result = subprocess.run(
            [sys.executable, "-m", "project_governance_runtime.checkers", "format", *args],
            cwd=self.root, env=self.environment, capture_output=True, text=True, check=False,
        )
        self.assertIn(result.returncode, (0, 1), result.stderr)
        return result.returncode, json.loads(result.stdout)

    def test_verified_notices_keep_exact_bytes(self) -> None:
        """Preserve common upstream names, including explicit replay-only suffixes."""
        for name in ("LICENSE", "COPYING.MPL2", "LICENSE.MIT", "NOTICE.txt"):
            with self.subTest(name=name):
                path = f"vendor/{name}"
                self.write(path, NOTICE)
                self.registry(path)
                code, report = self.run_format(path)
                self.assertEqual(code, 0, report)
                self.assertEqual(report["preserved_notices"], [path])
                self.assertEqual((self.root / path).read_bytes(), NOTICE)

    def test_no_registry_and_unlisted_text_still_fail(self) -> None:
        """Neither notice names nor ordinary text receive implicit exemptions."""
        self.write("vendor/LICENSE", NOTICE)
        code, report = self.run_format("vendor/LICENSE")
        self.assertEqual(code, 1)
        self.assertEqual(report["findings"][0]["rule_id"], "format.drift")
        self.registry()
        self.write("notes.txt", b"ordinary text  \n")
        code, report = self.run_format("vendor/LICENSE", "notes.txt")
        self.assertEqual(code, 1)
        self.assertEqual(report["findings"][0]["path"], "notes.txt")

    def test_modified_or_missing_notice_blocks_even_without_whitespace(self) -> None:
        """Detect invalid preservation evidence even when only the registry is selected."""
        self.registry()
        for content in (b"Changed notice\n", None):
            with self.subTest(content=content):
                if content is None:
                    (self.root / "vendor/LICENSE").unlink()
                else:
                    self.write("vendor/LICENSE", content)
                code, report = self.run_format(REGISTRY)
                self.assertEqual(code, 1)
                self.assertEqual(report["findings"][0]["rule_id"], "format.preservation-invalid")

    def test_invalid_registry_cannot_exempt_source_or_wildcards(self) -> None:
        """Keep the preservation authority narrow and reject malformed records."""
        for path in ("notes.txt", "code.py", "../LICENSE", "/LICENSE", "vendor/*/LICENSE"):
            with self.subTest(path=path):
                self.registry(path)
                code, report = self.run_format(REGISTRY)
                self.assertEqual(code, 1)
                self.assertEqual(report["preserved_notices"], [])
        for content in (b"{", b'[]', b'{"version": 2, "notices": []}'):
            self.write(REGISTRY, content)
            self.assertEqual(self.run_format(REGISTRY)[0], 1)

    def test_normal_selection_does_not_include_unrecognized_license_suffixes(self) -> None:
        """Distinguish the reported replay failure from ordinary format selection."""
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        self.write("COPYING.MPL2", NOTICE)
        self.write("LICENSE.MIT", NOTICE)
        self.assertEqual(self.run_format(all_mode=True)[0], 0)
        self.write("LICENSE", NOTICE)
        code, report = self.run_format(all_mode=True)
        self.assertEqual(code, 1)
        self.assertEqual([item["path"] for item in report["findings"]], ["LICENSE"])

    def test_invalid_evidence_fields_fail_closed(self) -> None:
        """Reject unreviewable identities, provenance, and duplicate registrations."""
        self.write("vendor/LICENSE", NOTICE)
        for field, value in (("sha256", "0" * 63), ("source", ""), ("source", 12)):
            with self.subTest(field=field, value=value):
                self.registry()
                registry = json.loads((self.root / REGISTRY).read_bytes())
                registry["notices"][0][field] = value
                self.write(REGISTRY, json.dumps(registry).encode())
                self.assertEqual(self.run_format("vendor/LICENSE")[0], 1)
        self.registry()
        registry = json.loads((self.root / REGISTRY).read_bytes())
        registry["notices"] *= 2
        self.write(REGISTRY, json.dumps(registry).encode())
        self.assertEqual(self.run_format("vendor/LICENSE")[0], 1)

    def test_symlink_notice_is_not_preserved(self) -> None:
        """Reject symlinks rather than granting authority to their destination."""
        self.write("original", NOTICE)
        (self.root / "LICENSE").symlink_to("original")
        self.registry("LICENSE")
        self.assertEqual(self.run_format("LICENSE")[0], 1)

    def test_staged_notice_and_registry_ignore_unstaged_edits(self) -> None:
        """Use base-tree registry bytes and packet notice bytes, not checkout replacements."""
        self.registry()
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        subprocess.run(["git", "add", REGISTRY], cwd=self.root, check=True)
        subprocess.run([
            "git", "-c", "user.name=Test", "-c", "user.email=test@example.org",
            "-c", "core.hooksPath=/dev/null", "commit", "-qm", "fixture",
        ], cwd=self.root, check=True)
        base = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=self.root, text=True).strip()
        self.write("after-image", NOTICE)
        self.write("vendor/LICENSE", b"unstaged replacement\n")
        self.write(REGISTRY, b"invalid unstaged registry")
        packet = {
            "kind": "project-governance-change-packet", "version": 1,
            "scope": "changed", "mode": "staged", "base_ref": base,
            "records": [{
                "status": "added", "path": "vendor/LICENSE",
                "before_path": None, "before_file_type": None,
                "after_path": str(self.root / "after-image"), "after_file_type": "regular",
                "after_sha256": hashlib.sha256(NOTICE).hexdigest(), "changed_ranges": [],
            }],
        }
        code, report = self.run_format(packet=packet)
        self.assertEqual(code, 0, report)
        self.assertEqual(report["preserved_notices"], ["vendor/LICENSE"])


if __name__ == "__main__":
    unittest.main()
