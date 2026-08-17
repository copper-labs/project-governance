#!/usr/bin/env python3
"""Prove test-quality analysis uses immutable packet after-images."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CHECKER = ROOT / "src/project_governance_runtime/checker_scripts/check-test-quality.py"


def write_packet(
    root: Path,
    repository_path: str,
    after_text: str,
    *,
    mode: str,
) -> Path:
    """Materialize one exact packet after-image independently of checkout bytes."""
    content = root / "packet-content" / repository_path
    content.parent.mkdir(parents=True, exist_ok=True)
    content.write_text(after_text, encoding="utf-8")
    packet = root / f"{mode}-packet.json"
    packet.write_text(json.dumps({
        "kind": "project-governance-change-packet",
        "version": 1,
        "scope": "changed",
        "mode": mode,
        "base_ref": "fixture",
        "records": [{
            "status": "added",
            "path": repository_path,
            "previous_path": None,
            "before_path": None,
            "after_path": str(content.resolve()),
            "changed_ranges": [{"start": 1, "end": max(1, len(after_text.splitlines()))}],
        }],
    }), encoding="utf-8")
    return packet


def run_checker(
    root: Path,
    *arguments: str,
    packet: Path | None = None,
    expected: int,
) -> dict[str, Any]:
    """Run the source checker and decode its structured result."""
    environment = {**os.environ, "PYTHONPATH": str(CHECKER.parent)}
    environment.pop("PROJECT_GOVERNANCE_CHANGE_PACKET", None)
    if packet is not None:
        environment["PROJECT_GOVERNANCE_CHANGE_PACKET"] = str(packet.resolve())
    result = subprocess.run(
        [sys.executable, str(CHECKER), *arguments],
        cwd=root,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != expected:
        raise AssertionError(result.stdout + result.stderr)
    return json.loads(result.stdout)


class RuntimeTestQualityTests(unittest.TestCase):
    """Keep heuristic findings advisory while packet failures remain blocking."""

    def test_staged_packet_wins_over_divergent_worktree_content(self) -> None:
        """Analyze the staged after-image even when the worktree has a later assertion."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            checkout = root / "tests/test_service.py"
            checkout.parent.mkdir()
            checkout.write_text("def test_value():\n    assert True\n", encoding="utf-8")
            packet = write_packet(root, "tests/test_service.py", "def test_value():\n    pass\n", mode="staged")
            result = run_checker(root, "--staged", packet=packet, expected=0)
        self.assertEqual(result["status"], "warning")
        self.assertEqual(result["findings"][0]["rule_id"], "test-quality.no-assertion")

    def test_changed_mode_reads_the_exact_packet_view(self) -> None:
        """Ignore assertion-free checkout bytes when the changed after-image has an assertion."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            checkout = root / "tests/test_service.py"
            checkout.parent.mkdir()
            checkout.write_text("def test_value():\n    pass\n", encoding="utf-8")
            packet = write_packet(root, "tests/test_service.py", "def test_value():\n    assert True\n", mode="changed")
            result = run_checker(root, "--changed", packet=packet, expected=0)
        self.assertEqual(result["status"], "passed")
        self.assertEqual(result["findings"], [])

    def test_lexical_quality_signals_are_advisory(self) -> None:
        """Report both weak heuristics without making the blocking pack command fail."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            packet = write_packet(
                root,
                "tests/service_accessors_test.ts",
                "test('getter delegates', () => { readValue(); });\n",
                mode="changed",
            )
            result = run_checker(root, "--changed", packet=packet, expected=0)
        self.assertEqual(result["status"], "warning")
        self.assertEqual(
            {item["rule_id"] for item in result["findings"]},
            {"test-quality.no-assertion", "test-quality.hollow-accessor"},
        )
        self.assertEqual({item["severity"] for item in result["findings"]}, {"advisory"})

    def test_missing_changed_packet_is_blocking(self) -> None:
        """Fail closed when direct changed selection has no runtime packet."""
        with tempfile.TemporaryDirectory() as directory:
            result = run_checker(Path(directory), "--changed", expected=1)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["findings"][0]["rule_id"], "test-quality.selection-failed")
        self.assertEqual(result["findings"][0]["severity"], "blocking")
        self.assertEqual(result["findings"][0]["path"], ".")

    def test_malformed_packet_is_blocking(self) -> None:
        """Reject a runtime packet that cannot satisfy the immutable envelope contract."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            packet = root / "malformed.json"
            packet.write_text("{}", encoding="utf-8")
            result = run_checker(root, "--changed", packet=packet, expected=1)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["findings"][0]["rule_id"], "test-quality.selection-failed")
        self.assertEqual(result["findings"][0]["severity"], "blocking")

    def test_unreadable_after_image_is_blocking(self) -> None:
        """Reject selected test bytes that are not valid UTF-8 after materialization."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            packet = write_packet(root, "tests/test_service.py", "assert True\n", mode="changed")
            packet_value = json.loads(packet.read_text(encoding="utf-8"))
            after_image = Path(packet_value["records"][0]["after_path"])
            after_image.write_bytes(b"\xff")
            result = run_checker(root, "--changed", packet=packet, expected=1)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(
            result["findings"][0]["rule_id"], "test-quality.after-image-unreadable"
        )
        self.assertEqual(result["findings"][0]["path"], "tests/test_service.py")

    def test_all_mode_scans_checkout_and_preserves_test_classification(self) -> None:
        """Scan test source while excluding support files and non-test source without Git."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            test = root / "tests/service_test.py"
            helper = root / "tests/helpers/build_value.py"
            source = root / "src/service.py"
            test.parent.mkdir(parents=True)
            helper.parent.mkdir(parents=True)
            source.parent.mkdir(parents=True)
            test.write_text("def test_value():\n    pass\n", encoding="utf-8")
            helper.write_text("def build_value():\n    return 1\n", encoding="utf-8")
            source.write_text("def value():\n    return 1\n", encoding="utf-8")
            result = run_checker(root, expected=0)
        self.assertEqual(result["status"], "warning")
        self.assertEqual([item["path"] for item in result["findings"]], ["tests/service_test.py"])

    def test_all_mode_rejects_explicit_path_escape(self) -> None:
        """Keep an explicit all-mode path inside the selected repository root."""
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory)
            root = parent / "repository"
            root.mkdir()
            (parent / "outside_test.py").write_text("assert True\n", encoding="utf-8")
            result = run_checker(root, "--path", "../outside_test.py", expected=1)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["findings"][0]["rule_id"], "test-quality.selection-failed")

    def test_all_mode_excludes_gitignored_test_trees(self) -> None:
        """Keep vendored and generated ignored tests outside the governed checkout."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", "-b", "main"], cwd=root, check=True)
            (root / ".gitignore").write_text("vendor/\n", encoding="utf-8")
            test = root / "tests/test_owned.py"
            test.parent.mkdir()
            test.write_text("def test_owned():\n    assert True\n", encoding="utf-8")
            ignored = root / "vendor/pkg/tests/test_ignored.py"
            ignored.parent.mkdir(parents=True)
            ignored.write_bytes(b"\xff")
            result = run_checker(root, expected=0)
        self.assertEqual(result["status"], "passed")
        self.assertEqual(result["findings"], [])


if __name__ == "__main__":
    unittest.main()
