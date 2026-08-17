#!/usr/bin/env python3
"""Prove maintainability review stays bounded and preserves human judgment."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CHECKER = ROOT / "src/project_governance_runtime/checker_scripts/check-code-smells.py"
SCRIPTS = CHECKER.parent
DEFAULTS = ROOT / "src/project_governance_runtime/defaults"


def class_source(name: str, fields: int, *, comments: int = 0) -> str:
    """Return one cohesive class whose physical extent is deterministic."""
    comment_lines = "".join("    # cohesive note\n" for _ in range(comments))
    field_lines = "".join(f"    field_{index} = {index}\n" for index in range(fields))
    return f"class {name}:\n{comment_lines}{field_lines}"


def decision(
    finding: str,
    path: str,
    symbol: str,
    disposition: str = "cohesion-accepted",
    **extra: Any,
) -> dict[str, Any]:
    """Build one valid version-2 architectural decision."""
    return {
        "finding": finding,
        "path": path,
        "symbol": symbol,
        "disposition": disposition,
        "owner": "source-owner",
        "reviewer": "architecture-reviewer",
        "approved_on": "2026-08-15",
        "responsibility": "Own one cohesive source responsibility only.",
        "rationale": "Keeping the implementation together is clearer than relocating related code.",
        **extra,
    }


def disposition_file(root: Path, records: list[dict[str, Any]], *, version: int = 2) -> Path:
    """Write a test-local YAML-compatible JSON disposition document."""
    path = root / "dispositions.yaml"
    path.write_text(
        json.dumps({"version": version, "owner": "test-owner", "dispositions": records}),
        encoding="utf-8",
    )
    return path


def packet_file(root: Path, records: list[dict[str, Any]], *, mode: str = "changed") -> Path:
    """Write one immutable changed-scope packet for a direct checker test."""
    path = root / "change-packet.json"
    path.write_text(
        json.dumps({
            "kind": "project-governance-change-packet",
            "version": 1,
            "scope": "changed",
            "mode": mode,
            "base_ref": "test-base",
            "records": records,
        }),
        encoding="utf-8",
    )
    return path


def run_checker(
    root: Path,
    *,
    expected: int,
    source: str | None = None,
    dispositions: Path | None = None,
    packet: Path | None = None,
    mode: str = "changed",
    selection_file: Path | None = None,
) -> dict[str, Any]:
    """Run the packaged checker in explicit or packet-backed changed mode."""
    arguments = [
        sys.executable,
        str(CHECKER),
        "--policy",
        str(DEFAULTS / "policies/code-quality.yaml"),
        "--dispositions",
        str(dispositions or DEFAULTS / "policies/code-quality-dispositions.yaml"),
        "--disposition-schema",
        str(DEFAULTS / "schemas/quality-disposition.schema.json"),
    ]
    if source is not None:
        arguments.extend(["--path", source])
    else:
        arguments.append(f"--{mode}")
    if selection_file is not None:
        arguments.extend(["--governance-selection-file", str(selection_file)])
    environment = {**os.environ, "PYTHONPATH": str(SCRIPTS)}
    if packet is not None:
        environment["PROJECT_GOVERNANCE_CHANGE_PACKET"] = str(packet)
    result = subprocess.run(
        arguments,
        cwd=root,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != expected:
        raise AssertionError(result.stdout + result.stderr)
    return json.loads(result.stdout)


class RuntimeMaintainabilityScopeTests(unittest.TestCase):
    """Keep the 500-line trigger universal without turning it into extraction policy."""

    def test_type_boundary_passes_at_500_and_blocks_at_501(self) -> None:
        """Retain the universal threshold while making its result a review obligation."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "boundary.py"
            source.write_text(class_source("Boundary", 499), encoding="utf-8")
            boundary = run_checker(root, source=source.name, expected=0)
            source.write_text(class_source("Boundary", 500), encoding="utf-8")
            oversized = run_checker(root, source=source.name, expected=1)
        self.assertEqual(boundary["findings"], [])
        self.assertEqual(oversized["findings"][0]["actual"], 501)
        self.assertEqual(oversized["findings"][0]["threshold"], 500)

    def test_all_mode_analyzes_tracked_source(self) -> None:
        """Keep explicit exhaustive proof exhaustive without affecting routine scope."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            source = root / "tracked.py"
            source.write_text(class_source("Tracked", 500), encoding="utf-8")
            subprocess.run(["git", "add", source.name], cwd=root, check=True)
            result = run_checker(root, mode="all", expected=1)
        self.assertEqual(result["findings"][0]["rule_id"], "quality.large-type")

    def test_cohesion_acceptance_survives_comments_and_growth(self) -> None:
        """Retain a reviewed narrow responsibility across nonarchitectural edits."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "cohesive.py"
            source.write_text(class_source("Cohesive", 500), encoding="utf-8")
            dispositions = disposition_file(root, [
                decision("quality.large-type", source.name, "Cohesive")
            ])
            initial = run_checker(
                root, source=source.name, dispositions=dispositions, expected=0
            )
            source.write_text(
                class_source("Cohesive", 550, comments=3), encoding="utf-8"
            )
            grown = run_checker(
                root, source=source.name, dispositions=dispositions, expected=0
            )
        self.assertEqual(initial["findings"][0]["severity"], "accepted")
        self.assertEqual(grown["findings"][0]["severity"], "accepted")
        self.assertEqual(initial["status"], "passed")
        self.assertEqual(initial["finding_count"], 1)
        self.assertEqual(initial["finding_counts"]["accepted"], 1)
        self.assertGreater(grown["findings"][0]["actual"], initial["findings"][0]["actual"])

    def test_temporary_waiver_reopens_on_exact_byte_change(self) -> None:
        """Keep temporary exceptions narrower than durable cohesion decisions."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "temporary.py"
            content = class_source("Temporary", 500)
            source.write_text(content, encoding="utf-8")
            dispositions = disposition_file(root, [decision(
                "quality.large-type",
                source.name,
                "Temporary",
                "temporary-waiver",
                current_value=501,
                source_fingerprint=f"sha256:{hashlib.sha256(content.encode()).hexdigest()}",
                expires="2099-01-01",
                remediation_plan=(
                    "Separate the transport responsibility after the current migration completes."
                ),
            )])
            run_checker(root, source=source.name, dispositions=dispositions, expected=0)
            source.write_text(content.replace("field_1 = 1", "field_1 = 2"), encoding="utf-8")
            result = run_checker(
                root, source=source.name, dispositions=dispositions, expected=1
            )
        self.assertIn("stale", result["findings"][0]["message"])

    def test_changed_class_does_not_promote_oversized_sibling(self) -> None:
        """Intersect changed ranges with the declaration that actually owns them."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            before = root / "before.py"
            after = root / "after.py"
            oversized = class_source("Oversized", 500)
            before.write_text(f"{oversized}class Changed:\n    value = 1\n", encoding="utf-8")
            after.write_text(f"{oversized}class Changed:\n    value = 2\n", encoding="utf-8")
            changed_line = len(after.read_text(encoding="utf-8").splitlines())
            packet = packet_file(root, [{
                "status": "modified",
                "path": "combined.py",
                "previous_path": None,
                "before_path": str(before),
                "after_path": str(after),
                "changed_ranges": [{"start": changed_line, "end": changed_line}],
            }])
            result = run_checker(root, packet=packet, expected=0)
        self.assertEqual(result["findings"], [])

    def test_selection_replay_uses_packet_after_image(self) -> None:
        """Do not substitute later working-tree bytes for a staged selection replay."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            checkout = root / "sample.py"
            checkout.write_text(class_source("Working", 500), encoding="utf-8")
            before = root / "before.py"
            after = root / "after.py"
            before.write_text("value = 1\n", encoding="utf-8")
            after.write_text("value = 2\n", encoding="utf-8")
            packet = packet_file(root, [{
                "status": "modified",
                "path": checkout.name,
                "previous_path": None,
                "before_path": str(before),
                "after_path": str(after),
                "changed_ranges": [{"start": 1, "end": 1}],
            }], mode="staged")
            selection = root / "selection.json"
            selection.write_text(
                json.dumps({"selectedInputs": [{"path": checkout.name}]}),
                encoding="utf-8",
            )
            result = run_checker(
                root,
                packet=packet,
                mode="staged",
                selection_file=selection,
                expected=0,
            )
        self.assertEqual(result["findings"], [])

    def test_many_narrow_types_do_not_create_aggregate_file_debt(self) -> None:
        """Measure parsed architectural units rather than their shared container length."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "narrow.py"
            source.write_text(
                "".join(f"class Narrow{index}:\n    value = {index}\n" for index in range(260)),
                encoding="utf-8",
            )
            line_count = len(source.read_text(encoding="utf-8").splitlines())
            result = run_checker(root, source=source.name, expected=0)
        self.assertGreater(line_count, 500)
        self.assertEqual(result["findings"], [])

    def test_nested_type_produces_only_innermost_obligation(self) -> None:
        """Subtract nested types from their container instead of duplicating findings."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "nested.py"
            inner_fields = "".join(
                f"        field_{index} = {index}\n" for index in range(500)
            )
            source.write_text(
                f"class Outer:\n    owner = 'outer'\n    class Inner:\n{inner_fields}",
                encoding="utf-8",
            )
            result = run_checker(root, source=source.name, expected=1)
        large_types = [
            item for item in result["findings"] if item["rule_id"] == "quality.large-type"
        ]
        self.assertEqual([item["symbol"] for item in large_types], ["Outer.Inner"])

    def test_body_edit_does_not_scan_untouched_complex_function(self) -> None:
        """Keep function metrics on the exact function intersected by the packet range."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            before = root / "function-before.py"
            after = root / "function-after.py"
            legacy = "def legacy(value):\n" + "".join(
                f"    if value == {index}:\n        return {index}\n" for index in range(18)
            ) + "    return -1\n\n"
            before.write_text(f"{legacy}def changed():\n    return 1\n", encoding="utf-8")
            after.write_text(f"{legacy}def changed():\n    return 2\n", encoding="utf-8")
            changed_line = len(after.read_text(encoding="utf-8").splitlines())
            packet = packet_file(root, [{
                "status": "modified",
                "path": "functions.py",
                "previous_path": None,
                "before_path": str(before),
                "after_path": str(after),
                "changed_ranges": [{"start": changed_line, "end": changed_line}],
            }])
            result = run_checker(root, packet=packet, expected=0)
        self.assertEqual(result["findings"], [])

    def test_parser_backed_file_level_code_retains_500_line_gate(self) -> None:
        """Apply the fallback to changed code outside declarations without double counting."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "module_code.py"
            assignments = "".join(f"value_{index} = {index}\n" for index in range(501))
            source.write_text(f"{assignments}class Narrow:\n    value = 1\n", encoding="utf-8")
            result = run_checker(root, source=source.name, expected=1)
        self.assertEqual(
            [item["rule_id"] for item in result["findings"]], ["quality.large-file"]
        )

    def test_version_one_records_emit_one_grouped_migration_blocker(self) -> None:
        """Fail closed once without multiplying one migration into per-file work."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "small.py"
            source.write_text("value = 1\n", encoding="utf-8")
            records = [
                {"finding": "quality.large-file", "path": f"old-{index}.py",
                 "symbol": "<file>", "disposition": "cohesion-accepted"}
                for index in range(3)
            ]
            dispositions = disposition_file(root, records, version=1)
            result = run_checker(
                root, source=source.name, dispositions=dispositions, expected=1
            )
        self.assertEqual(result["finding_count"], 1)
        self.assertEqual(
            result["findings"][0]["rule_id"], "quality.disposition-migration-required"
        )
        self.assertIn("old-0.py", result["findings"][0]["message"])

    def test_duplicate_stable_keys_fail_once(self) -> None:
        """Prevent ordering from choosing between conflicting human decisions."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "small.py"
            source.write_text("value = 1\n", encoding="utf-8")
            record = decision("quality.large-file", "other.py", "<file>")
            dispositions = disposition_file(root, [record, dict(record)])
            result = run_checker(
                root, source=source.name, dispositions=dispositions, expected=1
            )
        identity = [
            item for item in result["findings"]
            if item["rule_id"] == "quality.disposition-identity"
        ]
        self.assertEqual(len(identity), 1)

    def test_deleted_active_disposition_requires_explicit_relocation(self) -> None:
        """Do not silently lose an active architectural obligation during a move."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            before = root / "deleted-before.py"
            before.write_text("class Old:\n    value = 1\n", encoding="utf-8")
            dispositions = disposition_file(root, [
                decision("quality.large-type", "old.py", "Old", "refactor-required")
            ])
            packet = packet_file(root, [{
                "status": "deleted",
                "path": "old.py",
                "previous_path": None,
                "before_path": str(before),
                "after_path": None,
                "changed_ranges": [],
            }])
            result = run_checker(
                root, dispositions=dispositions, packet=packet, expected=1
            )
        self.assertEqual(result["finding_count"], 1)
        self.assertEqual(
            result["findings"][0]["rule_id"], "quality.disposition-relocation-required"
        )

    def test_registry_edit_cannot_delete_previous_active_decision(self) -> None:
        """Compare exact registry before/after images instead of trusting only current records."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_before = root / "source-before.py"
            source_after = root / "source-after.py"
            source_before.write_text("class Mixed:\n    value = 1\n", encoding="utf-8")
            source_after.write_text("class Mixed:\n    value = 2\n", encoding="utf-8")
            previous_registry = root / "registry-before.yaml"
            previous_registry.write_text(json.dumps({
                "version": 2,
                "owner": "test-owner",
                "dispositions": [
                    decision("quality.large-type", "mixed.py", "Mixed", "refactor-required")
                ],
            }), encoding="utf-8")
            current_registry = disposition_file(root, [])
            packet = packet_file(root, [
                {
                    "status": "modified",
                    "path": "mixed.py",
                    "previous_path": None,
                    "before_path": str(source_before),
                    "after_path": str(source_after),
                    "changed_ranges": [{"start": 2, "end": 2}],
                },
                {
                    "status": "modified",
                    "path": current_registry.name,
                    "previous_path": None,
                    "before_path": str(previous_registry),
                    "after_path": str(current_registry),
                    "changed_ranges": [{"start": 1, "end": 1}],
                },
            ])
            result = run_checker(
                root, dispositions=current_registry, packet=packet, expected=1
            )
        self.assertTrue(any(
            item["rule_id"] == "quality.disposition-transition-required"
            for item in result["findings"]
        ))

    def test_staged_registry_after_image_overrides_worktree_in_both_directions(self) -> None:
        """Compare HEAD to index even when the registry has additional unstaged edits."""
        for staged_has_record, expected_rule in (
            (False, "quality.disposition-transition-required"),
            (True, "quality.refactor-required"),
        ):
            with self.subTest(staged_has_record=staged_has_record), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                source_before = root / "source-before.py"
                source_after = root / "source-after.py"
                source_before.write_text("class Mixed:\n    value = 1\n", encoding="utf-8")
                source_after.write_text("class Mixed:\n    value = 2\n", encoding="utf-8")
                record = decision(
                    "quality.large-type", "mixed.py", "Mixed", "refactor-required"
                )
                empty = {"version": 2, "owner": "test-owner", "dispositions": []}
                active = {"version": 2, "owner": "test-owner", "dispositions": [record]}
                registry_before = root / "registry-before.yaml"
                registry_after = root / "registry-after.yaml"
                registry_before.write_text(
                    json.dumps(empty if staged_has_record else active), encoding="utf-8"
                )
                registry_after.write_text(
                    json.dumps(active if staged_has_record else empty), encoding="utf-8"
                )
                checkout_registry = root / "dispositions.yaml"
                checkout_registry.write_text(
                    json.dumps(empty if staged_has_record else active), encoding="utf-8"
                )
                packet = packet_file(root, [
                    {
                        "status": "modified",
                        "path": "mixed.py",
                        "previous_path": None,
                        "before_path": str(source_before),
                        "after_path": str(source_after),
                        "changed_ranges": [{"start": 2, "end": 2}],
                    },
                    {
                        "status": "modified",
                        "path": checkout_registry.name,
                        "previous_path": None,
                        "before_path": str(registry_before),
                        "after_path": str(registry_after),
                        "changed_ranges": [{"start": 1, "end": 1}],
                    },
                ], mode="staged")
                result = run_checker(
                    root,
                    dispositions=checkout_registry,
                    packet=packet,
                    mode="staged",
                    expected=1,
                )
            self.assertTrue(any(
                item["rule_id"] == expected_rule for item in result["findings"]
            ))

    def test_renamed_large_type_requires_deliberately_moved_decision(self) -> None:
        """Treat a path rename as a bounded new decision rather than an inferred alias."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            before = root / "renamed-before.py"
            after = root / "renamed-after.py"
            content = class_source("Cohesive", 500)
            before.write_text(content, encoding="utf-8")
            after.write_text(content, encoding="utf-8")
            packet = packet_file(root, [{
                "status": "renamed",
                "path": "new.py",
                "previous_path": "old.py",
                "before_path": str(before),
                "after_path": str(after),
                "changed_ranges": [],
            }])
            old_decision = disposition_file(root, [
                decision("quality.large-type", "old.py", "Cohesive")
            ])
            blocked = run_checker(
                root, dispositions=old_decision, packet=packet, expected=1
            )
            moved_decision = disposition_file(root, [
                decision("quality.large-type", "new.py", "Cohesive")
            ])
            accepted = run_checker(
                root, dispositions=moved_decision, packet=packet, expected=0
            )
        self.assertEqual(blocked["findings"][0]["severity"], "blocking")
        self.assertEqual(accepted["findings"][0]["severity"], "accepted")

    def test_pure_rename_does_not_reopen_function_debt(self) -> None:
        """Review renamed architectural identity without rescanning untouched functions."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            before = root / "complex-before.py"
            after = root / "complex-after.py"
            content = "def legacy(value):\n" + "".join(
                f"    if value == {index}:\n        return {index}\n" for index in range(18)
            ) + "    return -1\n"
            before.write_text(content, encoding="utf-8")
            after.write_text(content, encoding="utf-8")
            packet = packet_file(root, [{
                "status": "renamed",
                "path": "new.py",
                "previous_path": "old.py",
                "before_path": str(before),
                "after_path": str(after),
                "changed_ranges": [],
            }])
            result = run_checker(root, packet=packet, expected=0)
        self.assertEqual(result["findings"], [])

    def test_refactor_decision_remains_blocking_below_size_threshold(self) -> None:
        """Reject mechanical shrinking as an implicit architectural resolution."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "still_mixed.py"
            source.write_text(class_source("StillMixed", 200), encoding="utf-8")
            dispositions = disposition_file(root, [
                decision(
                    "quality.large-type",
                    source.name,
                    "StillMixed",
                    "refactor-required",
                )
            ])
            result = run_checker(
                root, source=source.name, dispositions=dispositions, expected=1
            )
        self.assertEqual(result["findings"][0]["rule_id"], "quality.refactor-required")

    def test_malformed_registry_shape_fails_closed(self) -> None:
        """Never replace a present invalid registry with an empty authorization set."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "small.py"
            source.write_text("value = 1\n", encoding="utf-8")
            dispositions = root / "dispositions.yaml"
            dispositions.write_text("- not-a-mapping\n", encoding="utf-8")
            result = run_checker(
                root, source=source.name, dispositions=dispositions, expected=1
            )
        self.assertTrue(any(
            item["rule_id"] == "quality.disposition-schema"
            for item in result["findings"]
        ))


if __name__ == "__main__":
    unittest.main()
