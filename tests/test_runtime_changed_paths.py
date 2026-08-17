#!/usr/bin/env python3
"""Prove one Git subject supplies exact paths, ranges, and content to every checker."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "src/project_governance_runtime/checker_scripts"))

from project_governance_runtime.changed_paths import (  # noqa: E402
    ChangedPathError,
    resolve_change_scope,
    subject_digest,
)
import project_governance_runtime.changed_paths as changed_paths_module  # noqa: E402
from project_governance_runtime.execution_flow import execution_environment  # noqa: E402
from governance_changed_paths import (  # noqa: E402
    analysis_path,
    changed_line_ranges,
    changed_path_records as checker_changed_path_records,
)


def run(root: Path, *arguments: str) -> str:
    """Run one deterministic Git fixture command."""
    result = subprocess.run(
        [*arguments],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise AssertionError(result.stderr or result.stdout)
    return result.stdout.strip()


def initialize(root: Path) -> str:
    """Create one baseline commit and return its object id."""
    run(root, "git", "init", "-q", "-b", "main")
    run(root, "git", "config", "user.email", "runtime@example.invalid")
    run(root, "git", "config", "user.name", "Runtime Tests")
    (root / "sample.py").write_text("first\nsecond\n", encoding="utf-8")
    run(root, "git", "add", "sample.py")
    run(root, "git", "commit", "-qm", "baseline")
    return run(root, "git", "rev-parse", "HEAD")


class RuntimeChangedPathTests(unittest.TestCase):
    """Keep changed scope immutable, exact, and fail-closed."""

    def test_staged_packet_materializes_index_content_and_exact_range(self) -> None:
        """Never let an unstaged edit change the bytes selected for pre-commit."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            baseline = initialize(root)
            path = root / "sample.py"
            path.write_text("first\nstaged\n", encoding="utf-8")
            run(root, "git", "add", "sample.py")
            path.write_text("first\nworking\nextra\n", encoding="utf-8")
            scope = resolve_change_scope(root, staged=True)
            plan = {
                "stage": "pre-commit",
                "mode": "impacted",
                "changed_paths": ["sample.py"],
                "change_scope": scope,
            }
            with execution_environment(root, plan) as environment:
                packet = json.loads(
                    Path(environment["PROJECT_GOVERNANCE_CHANGE_PACKET"]).read_text(
                        encoding="utf-8"
                    )
                )
                record = packet["records"][0]
                before = Path(record["before_path"]).read_text(encoding="utf-8")
                after = Path(record["after_path"]).read_text(encoding="utf-8")
                self.assertEqual(record["changed_ranges"], [{"start": 2, "end": 2}])
                self.assertEqual(before, "first\nsecond\n")
                self.assertEqual(after, "first\nstaged\n")
                self.assertNotEqual(after, path.read_text(encoding="utf-8"))
                self.assertEqual(packet["base_ref"], baseline)
                self.assertEqual(packet["subject_digest"], scope["subject_digest"])
                self.assertEqual(
                    environment["PROJECT_GOVERNANCE_SUBJECT_DIGEST"],
                    scope["subject_digest"],
                )
                with patch.dict(os.environ, environment, clear=True):
                    self.assertEqual(changed_line_ranges("staged"), {"sample.py": [(2, 2)]})
                    self.assertEqual(
                        analysis_path("sample.py", "staged").read_text(encoding="utf-8"),
                        "first\nstaged\n",
                    )
                    materialized = Path(record["after_path"])
                    materialized.chmod(0o600)
                    materialized.write_text("tampered\n", encoding="utf-8")
                    with self.assertRaisesRegex(RuntimeError, "no longer matches"):
                        analysis_path("sample.py", "staged")

    def test_subject_digest_is_stable_across_materialization_roots(self) -> None:
        """Exclude ephemeral paths from the exact logical subject identity."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize(root)
            path = root / "sample.py"
            path.write_text("first\nstaged\n", encoding="utf-8")
            run(root, "git", "add", "sample.py")
            scope = resolve_change_scope(root, staged=True)
            plan = {"change_scope": scope}
            packets: list[dict[str, object]] = []
            packet_paths: list[str] = []
            for _ in range(2):
                with execution_environment(root, plan) as environment:
                    packet_paths.append(environment["PROJECT_GOVERNANCE_CHANGE_PACKET"])
                    packets.append(
                        json.loads(Path(packet_paths[-1]).read_text(encoding="utf-8"))
                    )

        self.assertNotEqual(packet_paths[0], packet_paths[1])
        self.assertEqual(packets[0]["subject_digest"], packets[1]["subject_digest"])
        self.assertEqual(packets[0]["subject_digest"], scope["subject_digest"])
        self.assertNotIn(directory, str(packets[0]["subject_digest"]))

    def test_subject_digest_is_independent_of_record_input_order(self) -> None:
        """Canonicalize equivalent logical records before hashing them."""
        records = [
            {
                "status": "modified",
                "path": path,
                "previous_path": None,
                "before": {"identity": f"before-{path}"},
                "after": {"identity": f"after-{path}"},
                "changed_ranges": [{"start": 1, "end": 1}],
            }
            for path in ("b.py", "a.py")
        ]
        self.assertEqual(subject_digest(records), subject_digest(list(reversed(records))))

    def test_one_byte_subject_change_changes_digest(self) -> None:
        """Bind worktree subjects to exact after-image bytes."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize(root)
            path = root / "sample.py"
            path.write_bytes(b"first\nvalue-a\n")
            first = resolve_change_scope(root, base_ref="main")
            path.write_bytes(b"first\nvalue-b\n")
            second = resolve_change_scope(root, base_ref="main")

        self.assertNotEqual(first["subject_digest"], second["subject_digest"])

    def test_all_scope_has_no_content_bound_subject_digest(self) -> None:
        """Keep explicit all mode honest about reading the live checkout."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize(root)
            scope = resolve_change_scope(root, all_scope=True)
            with patch.dict(
                os.environ,
                {"PROJECT_GOVERNANCE_SUBJECT_DIGEST": "sha256:stale-parent-value"},
            ):
                with execution_environment(root, {"change_scope": scope}) as environment:
                    packet = json.loads(
                        Path(environment["PROJECT_GOVERNANCE_CHANGE_PACKET"]).read_text(
                            encoding="utf-8"
                        )
                    )

        self.assertIsNone(scope["subject_digest"])
        self.assertIsNone(packet["subject_digest"])
        self.assertNotIn("PROJECT_GOVERNANCE_SUBJECT_DIGEST", environment)

    def test_all_mode_uses_direct_checkout_without_loading_packet(self) -> None:
        """Preserve the direct-check fallback for explicit exhaustive checks."""
        with patch(
            "governance_changed_paths._all_records",
            return_value=[("sample.py", False)],
        ) as all_records, patch("governance_changed_paths._packet") as packet:
            records = checker_changed_path_records("all")

        self.assertEqual(records, [("sample.py", False)])
        all_records.assert_called_once_with()
        packet.assert_not_called()

    def test_staged_packet_keeps_planned_blob_after_index_changes(self) -> None:
        """Bind staged ranges and bytes to the blob selected during planning."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize(root)
            path = root / "sample.py"
            path.write_text("first\nplanned\n", encoding="utf-8")
            run(root, "git", "add", "sample.py")
            scope = resolve_change_scope(root, staged=True)
            path.write_text("first\nnewer index\nextra\n", encoding="utf-8")
            run(root, "git", "add", "sample.py")
            plan = {"change_scope": scope}

            with execution_environment(root, plan) as environment:
                packet = json.loads(
                    Path(environment["PROJECT_GOVERNANCE_CHANGE_PACKET"]).read_text(
                        encoding="utf-8"
                    )
                )
                record = packet["records"][0]
                self.assertEqual(record["changed_ranges"], [{"start": 2, "end": 2}])
                self.assertEqual(
                    Path(record["after_path"]).read_text(encoding="utf-8"),
                    "first\nplanned\n",
                )

    def test_scope_resolution_rejects_index_mutation_between_ranges_and_blob(self) -> None:
        """Do not bind an earlier range snapshot to a later staged blob."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize(root)
            path = root / "sample.py"
            path.write_text("first\nplanned\n", encoding="utf-8")
            run(root, "git", "add", "sample.py")
            original = changed_paths_module._git_blob_identity
            mutated = False

            def mutate_before_index_identity(target: Path, object_name: str) -> str:
                nonlocal mutated
                if object_name.startswith(":") and not mutated:
                    path.write_text("new\nrange\nshape\n", encoding="utf-8")
                    run(root, "git", "add", "sample.py")
                    mutated = True
                return original(target, object_name)

            with patch.object(
                changed_paths_module,
                "_git_blob_identity",
                side_effect=mutate_before_index_identity,
            ), self.assertRaisesRegex(ChangedPathError, "changed while resolving"):
                resolve_change_scope(root, staged=True)

    def test_worktree_packet_groups_stale_paths_before_materialization(self) -> None:
        """Fail once when planned worktree identities no longer match their content."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize(root)
            other = root / "other.py"
            other.write_text("baseline\n", encoding="utf-8")
            run(root, "git", "add", "other.py")
            run(root, "git", "commit", "-qm", "other baseline")
            (root / "sample.py").write_text("first\nplanned\n", encoding="utf-8")
            other.write_text("planned\n", encoding="utf-8")
            scope = resolve_change_scope(root, base_ref="main")
            (root / "sample.py").write_text("first\nnewer\n", encoding="utf-8")
            other.write_text("newer\n", encoding="utf-8")

            with self.assertRaises(ValueError) as caught:
                with execution_environment(root, {"change_scope": scope}):
                    self.fail("stale worktree content must not reach execution")
            message = str(caught.exception)
            self.assertIn("change scope is stale", message)
            self.assertIn("other.py", message)
            self.assertIn("sample.py", message)

    def test_worktree_scope_captures_final_symlinks_without_dereferencing(self) -> None:
        """Represent final symlinks as Git link payloads without reading their targets."""
        for tracked in (False, True):
            with self.subTest(tracked=tracked), tempfile.TemporaryDirectory() as directory:
                root = Path(directory) / "repository"
                root.mkdir()
                initialize(root)
                outside = Path(directory) / "outside.txt"
                outside.write_text("outside-private-bytes\n", encoding="utf-8")
                link = root / "linked.py"
                link.symlink_to(outside)
                if tracked:
                    run(root, "git", "add", "linked.py")
                    run(root, "git", "commit", "-qm", "track link")
                    link.unlink()
                    second = Path(directory) / "other-outside.txt"
                    second.write_text("other-private-bytes\n", encoding="utf-8")
                    link.symlink_to(second)

                scope = resolve_change_scope(root, base_ref="main")
                expected = os.fsencode(os.readlink(link))
                record = next(
                    item for item in scope["records"] if item["path"] == "linked.py"
                )
                self.assertEqual(
                    record["after"]["identity"],
                    "sha256:" + hashlib.sha256(expected).hexdigest(),
                )
                with execution_environment(root, {"change_scope": scope}) as environment:
                    packet = json.loads(
                        Path(environment["PROJECT_GOVERNANCE_CHANGE_PACKET"]).read_text(
                            encoding="utf-8"
                        )
                    )
                    after_path = next(
                        item["after_path"]
                        for item in packet["records"]
                        if item["path"] == "linked.py"
                    )
                    self.assertEqual(Path(after_path).read_bytes(), expected)
                    self.assertNotIn(b"private-bytes", Path(after_path).read_bytes())

    def test_explicit_scope_rejects_a_symlinked_parent_directory(self) -> None:
        """Keep an explicit nested path from traversing an external directory link."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "repository"
            root.mkdir()
            initialize(root)
            outside = Path(directory) / "outside"
            outside.mkdir()
            (outside / "private.py").write_text(
                "outside-private-bytes\n", encoding="utf-8"
            )
            (root / "linked-dir").symlink_to(outside, target_is_directory=True)

            with self.assertRaisesRegex(ChangedPathError, "symlink"):
                resolve_change_scope(
                    root,
                    explicit_paths=["linked-dir/private.py"],
                    base_ref="main",
                )

    def test_branch_scope_uses_explicit_merge_base_and_includes_untracked(self) -> None:
        """Resolve one branch subject and fully include a new untracked path."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            baseline = initialize(root)
            run(root, "git", "switch", "-qc", "feature")
            (root / "sample.py").write_text("first\nchanged\n", encoding="utf-8")
            (root / "new.py").write_text("new\n", encoding="utf-8")
            scope = resolve_change_scope(root, base_ref="main")
        records = {record["path"]: record for record in scope["records"]}
        self.assertEqual(scope["base_ref"], baseline)
        self.assertEqual(records["sample.py"]["changed_ranges"], [{"start": 2, "end": 2}])
        self.assertEqual(records["new.py"]["status"], "added")
        self.assertIsNone(records["new.py"]["before"])

    def test_branch_scope_without_upstream_fails_closed(self) -> None:
        """Do not silently compare a local branch with a conventional main name."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize(root)
            run(root, "git", "switch", "-qc", "feature")
            with patch.dict(os.environ, {}, clear=True), self.assertRaises(ChangedPathError):
                resolve_change_scope(root)

    def test_explicit_paths_require_an_explicit_base(self) -> None:
        """Reject path-only scope that cannot produce truthful changed ranges."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize(root)
            with patch.dict(os.environ, {}, clear=True), self.assertRaises(ChangedPathError):
                resolve_change_scope(root, explicit_paths=["sample.py"])


if __name__ == "__main__":
    unittest.main()
