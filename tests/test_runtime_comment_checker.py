#!/usr/bin/env python3
"""Exercise normalized pass and blocking results from the packaged comment checker.

The runtime package invokes its copied checker directly, so this focused test verifies that the
public command preserves the source-comment result envelope for both policy outcomes.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHECKER = ROOT / "src/project_governance_runtime/checker_scripts/check-comments.py"
SCRIPTS = CHECKER.parent
DEFAULTS = ROOT / "src/project_governance_runtime/defaults"


def run_checker(
    root: Path,
    path: str | None = None,
    *,
    expected: int,
    packet: Path | None = None,
    waivers: Path | None = None,
    policy: Path | None = None,
    adapters: Path | None = None,
) -> dict[str, object]:
    """Run the packaged checker against one source file and decode its evidence envelope."""
    result = subprocess.run(
        [
            sys.executable,
            str(CHECKER),
            *(["--path", path] if path is not None else ["--staged"]),
            "--policy",
            str(policy or DEFAULTS / "policies/source-comments.yaml"),
            "--waivers",
            str(waivers or DEFAULTS / "policies/source-comment-waivers.yaml"),
            "--adapters",
            str(adapters or DEFAULTS / "policies/source-comment-adapters.yaml"),
            "--policy-schema",
            str(DEFAULTS / "schemas/source-comments.schema.json"),
            "--waivers-schema",
            str(DEFAULTS / "schemas/source-comment-waivers.schema.json"),
            "--adapters-schema",
            str(DEFAULTS / "schemas/source-comment-adapters.schema.json"),
        ],
        cwd=root,
        env={
            **os.environ,
            "PYTHONPATH": str(SCRIPTS),
            "PROJECT_GOVERNANCE_COMMENT_FIXTURES": str(DEFAULTS / "fixtures/comment-quality"),
            **(
                {"PROJECT_GOVERNANCE_CHANGE_PACKET": str(packet.resolve())}
                if packet is not None
                else {}
            ),
        },
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != expected:
        raise AssertionError(result.stdout + result.stderr)
    return json.loads(result.stdout)


def change_packet(
    root: Path,
    repository_path: str,
    before: str | None,
    after: str,
    ranges: list[tuple[int, int]],
) -> Path:
    """Materialize one immutable staged packet for focused checker behavior tests."""
    materialized = root / "packet-content"
    materialized.mkdir()
    before_path = materialized / "before.py"
    after_path = materialized / "after.py"
    if before is not None:
        before_path.write_text(before, encoding="utf-8")
    after_path.write_text(after, encoding="utf-8")
    packet = root / "change-packet.json"
    packet.write_text(
        json.dumps(
            {
                "kind": "project-governance-change-packet",
                "version": 1,
                "scope": "changed",
                "mode": "staged",
                "base_ref": "a" * 40,
                "records": [
                    {
                        "status": "added" if before is None else "modified",
                        "path": repository_path,
                        "previous_path": None,
                        "before_path": str(before_path.resolve()) if before is not None else None,
                        "after_path": str(after_path.resolve()),
                        "changed_ranges": [
                            {"start": start, "end": end} for start, end in ranges
                        ],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    return packet


class RuntimeCommentCheckerTests(unittest.TestCase):
    """Protect the installed checker command's normalized comment-quality outcomes."""

    def test_normalized_pass_and_failure_results(self) -> None:
        """Keep active Python analysis and blocking declaration gaps externally observable."""
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            passing = root / "passing.py"
            passing.write_text(
                '"""Responsibility: Define a documented runtime checker fixture.\n\n'
                'Context: The fixture proves that the packaged checker preserves normalized pass results.\n"""\n\n'
                'class DocumentedFixture:\n'
                '    """Provide a documented declaration for the active Python analyzer.\n\n'
                '    This type keeps runtime result assertions independent from checker implementation details.\n'
                '    """\n\n'
                '    def value(self) -> str:\n'
                '        """Return a stable value for this policy-conforming fixture."""\n'
                '        return "ok"\n',
                encoding="utf-8",
            )
            passed = run_checker(root, passing.name, expected=0)
            failing = root / "failing.py"
            failing.write_text(
                '"""Responsibility: Define an incomplete runtime checker fixture.\n\n'
                'Context: The fixture exposes the normalized blocking declaration result.\n"""\n\n'
                'class MissingDeclarationComment:\n'
                '    pass\n',
                encoding="utf-8",
            )
            failed = run_checker(root, failing.name, expected=1)
        self.assertEqual(passed["status"], "passed")
        self.assertEqual(passed["findings"], [])
        self.assertEqual(failed["status"], "failed")
        self.assertIn("SC005", {item["rule_id"] for item in failed["findings"]})

    def test_unsupported_language_fallback_is_advisory(self) -> None:
        """Never block source when the runtime has no parser-backed language adapter."""
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            source = root / "undocumented.js"
            source.write_text("export function value() { return 1; }\n", encoding="utf-8")
            result = run_checker(root, source.name, expected=0)
        self.assertEqual(result["status"], "warning")
        self.assertTrue(result["findings"])
        self.assertEqual({item["severity"] for item in result["findings"]}, {"advisory"})

    def test_kotlin_internal_containers_hide_default_and_explicit_public_members(self) -> None:
        """Exclude declarations whose effective visibility is narrowed by an enclosing type."""
        source = (
            "// Responsibility: Provide internal persistence helpers for one runtime boundary.\n"
            "// Context: Public callers reach these helpers only through a separately documented facade.\n"
            "package fixtures\n\n"
            "internal class Store {\n"
            "    fun save() = Unit\n"
            "    public fun replace() = Unit\n"
            "    internal object Cache {\n"
            "        fun clear() = Unit\n"
            "    }\n"
            "}\n\n"
            "private object Registry {\n"
            "    fun register() = Unit\n"
            "}\n"
        )
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            path = root / "internal-store.kt"
            path.write_text(source, encoding="utf-8")
            result = run_checker(root, path.name, expected=0)
        self.assertEqual(result["status"], "passed")
        self.assertEqual(result["findings"], [])

    def test_kotlin_internal_nested_type_does_not_hide_public_siblings(self) -> None:
        """Keep genuine public declarations governed beside an internal nested implementation."""
        source = (
            "// Responsibility: Expose one documented store while retaining internal helpers.\n"
            "// Context: The fixture distinguishes public API from nested implementation details.\n"
            "package fixtures\n\n"
            "/** Provide the externally visible persistence operations used by callers. */\n"
            "public class PublicStore {\n"
            "    internal class Backend {\n"
            "        fun save() = Unit\n"
            "    }\n\n"
            "    fun load() = Unit\n"
            "}\n"
        )
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            path = root / "public-store.kt"
            path.write_text(source, encoding="utf-8")
            result = run_checker(root, path.name, expected=1)
        blockers = [item for item in result["findings"] if item["severity"] == "blocking"]
        self.assertEqual({item["rule_id"] for item in blockers}, {"SC005"})
        self.assertEqual(len(blockers), 1)
        self.assertIn("PublicStore.load", blockers[0]["declaration"])

    def test_kotlin_body_only_edit_keeps_old_comment_debt_advisory(self) -> None:
        """Preserve the changed-signature ratchet when restoring Kotlin analysis."""
        before = "public class LegacyStore {\n    fun save() {\n        return\n    }\n}\n"
        after = "public class LegacyStore {\n    fun save() {\n        println(\"saved\")\n        return\n    }\n}\n"
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            packet = change_packet(root, "legacy-store.kt", before, after, [(3, 3)])
            result = run_checker(root, expected=0, packet=packet)
        self.assertEqual(result["status"], "warning")
        self.assertTrue(result["findings"])
        self.assertEqual({item["severity"] for item in result["findings"]}, {"advisory"})

    def test_kotlin_checker_accepts_existing_v5_adapter_registry(self) -> None:
        """Let adopters upgrade the wheel before rewriting their active Kotlin registry."""
        source = (
            "// Responsibility: Provide one internal persistence helper for compatibility proof.\n"
            "// Context: Existing governance-v5 registries receive the corrected checker behavior.\n"
            "package fixtures\n\n"
            "internal class Store {\n"
            "    fun save() = Unit\n"
            "}\n"
        )
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            path = root / "compatibility.kt"
            path.write_text(source, encoding="utf-8")
            adapters = root / "source-comment-adapters.yaml"
            adapters.write_text(
                (DEFAULTS / "policies/source-comment-adapters.yaml")
                .read_text(encoding="utf-8")
                .replace("analyzer_version: governance-v6", "analyzer_version: governance-v5"),
                encoding="utf-8",
            )
            result = run_checker(
                root, path.name, expected=0, adapters=adapters
            )
        self.assertEqual(result["status"], "passed")
        self.assertEqual(result["findings"], [])

    def test_body_only_edit_keeps_old_comment_debt_advisory(self) -> None:
        """Do not reopen an old declaration gap when only its implementation body changes."""
        before = "class LegacyService:\n    def value(self):\n        return 1\n"
        after = "class LegacyService:\n    def value(self):\n        return 2\n"
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            packet = change_packet(root, "legacy.py", before, after, [(3, 3)])
            result = run_checker(root, expected=0, packet=packet)
        self.assertEqual(result["status"], "warning")
        self.assertTrue(result["findings"])
        self.assertEqual({item["severity"] for item in result["findings"]}, {"advisory"})

    def test_new_public_declaration_in_existing_file_blocks(self) -> None:
        """Fully govern a public declaration absent from the packet before-image."""
        overview = (
            '"""Responsibility: Provide a focused packet fixture.\n\n'
            'Context: This module proves declaration ratchet behavior.\n"""\n\n'
        )
        before = overview + "VALUE = 1\n"
        after = before + "\ndef exposed_value():\n    return VALUE\n"
        changed_line = len(after.splitlines()) - 1
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            packet = change_packet(root, "service.py", before, after, [(changed_line, changed_line)])
            result = run_checker(root, expected=1, packet=packet)
        blockers = [item for item in result["findings"] if item["severity"] == "blocking"]
        self.assertEqual({item["rule_id"] for item in blockers}, {"SC005"})
        self.assertEqual({item["declaration"] for item in blockers}, {"exposed_value"})

    def test_existing_declaration_blocks_only_when_signature_intersects(self) -> None:
        """Treat an exact signature edit as material without using the declaration body."""
        overview = (
            '"""Responsibility: Provide exact signature intersection evidence.\n\n'
            'Context: This module isolates header changes from body changes.\n"""\n\n'
        )
        before = overview + "def value():\n    return 1\n"
        after = overview + "def value() -> int:\n    return 1\n"
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            packet = change_packet(root, "service.py", before, after, [(6, 6)])
            result = run_checker(root, expected=1, packet=packet)
        blockers = [item for item in result["findings"] if item["severity"] == "blocking"]
        self.assertEqual({item["rule_id"] for item in blockers}, {"SC005"})
        self.assertEqual({item["declaration"] for item in blockers}, {"value"})

    def test_private_declaration_is_governed_only_at_an_authority_boundary(self) -> None:
        """Enforce private boundary declarations without widening ordinary private scope."""
        overview = (
            '"""Responsibility: Provide focused authority-boundary evidence.\n\n'
            'Context: This module proves private declarations stay narrow.\n\n'
            'Boundary: Private declarations here own a governed runtime decision.\n"""\n\n'
        )
        before = overview + "VALUE = 1\n"
        after = before + "\ndef _resolve_authority():\n    return VALUE\n"
        changed_line = len(after.splitlines()) - 1
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            packet = change_packet(root, "boundary/service.py", before, after, [(changed_line, changed_line)])
            policy = root / "source-comments.yaml"
            policy.write_text(
                (DEFAULTS / "policies/source-comments.yaml")
                .read_text(encoding="utf-8")
                .replace("boundary_globs: []", 'boundary_globs: ["boundary/**"]'),
                encoding="utf-8",
            )
            boundary_result = run_checker(root, expected=1, packet=packet, policy=policy)
        blockers = [item for item in boundary_result["findings"] if item["severity"] == "blocking"]
        self.assertEqual({item["rule_id"] for item in blockers}, {"SC005"})
        self.assertEqual({item["declaration"] for item in blockers}, {"_resolve_authority"})

        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            packet = change_packet(root, "ordinary/service.py", before, after, [(changed_line, changed_line)])
            ordinary_result = run_checker(root, expected=0, packet=packet)
        self.assertNotIn(
            "_resolve_authority",
            {item.get("declaration") for item in ordinary_result["findings"]},
        )

    def test_existing_overview_gap_is_advisory_but_new_file_gap_blocks(self) -> None:
        """Bind overview enforcement to file creation rather than arbitrary changed lines."""
        existing = "VALUE = 1\n"
        changed = "VALUE = 2\n"
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            existing_packet = change_packet(root, "existing.py", existing, changed, [(1, 1)])
            existing_result = run_checker(root, expected=0, packet=existing_packet)
        overview = [item for item in existing_result["findings"] if item["rule_id"] in {"SC002", "SC003"}]
        self.assertEqual({item["severity"] for item in overview}, {"advisory"})
        self.assertEqual({item["declaration"] for item in overview}, {"<file>"})

        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            new_packet = change_packet(root, "new.py", None, changed, [(1, 1)])
            new_result = run_checker(root, expected=1, packet=new_packet)
        new_overview = [item for item in new_result["findings"] if item["rule_id"] in {"SC002", "SC003"}]
        self.assertEqual({item["severity"] for item in new_overview}, {"blocking"})
        self.assertEqual({item["declaration"] for item in new_overview}, {"<file>"})

    def test_packet_after_image_wins_over_checkout_content(self) -> None:
        """Analyze immutable staged bytes even when the checkout contains different edits."""
        documented = (
            '"""Responsibility: Provide immutable after-image evidence.\n\n'
            'Context: This packet content is independent of checkout bytes.\n"""\n\n'
            "def value():\n"
            '    """Return the packet-owned value for this focused fixture."""\n'
            "    return 1\n"
        )
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            (root / "service.py").write_text("def undocumented():\n    return 2\n", encoding="utf-8")
            packet = change_packet(root, "service.py", None, documented, [(1, 7)])
            result = run_checker(root, expected=0, packet=packet)
        self.assertEqual(result["status"], "passed")
        self.assertEqual(result["findings"], [])

    def test_symbol_waiver_survives_unrelated_line_movement(self) -> None:
        """Keep waivers bound to normalized path/rule/symbol rather than source position."""
        overview = (
            '"""Responsibility: Provide stable waiver identity evidence.\n\n'
            'Context: This fixture moves source lines without changing its symbol.\n"""\n\n'
        )
        before = overview + "def value():\n    return 1\n"
        after = overview + "\n\ndef value():\n    return 1\n"
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            packet = change_packet(root, "service.py", before, after, [(6, 8)])
            waivers = root / "waivers.yaml"
            waivers.write_text(
                "version: 1\n"
                "owner: runtime-tests\n"
                "waivers:\n"
                "  - rule_id: SC005\n"
                "    path: ./service.py\n"
                "    declaration: value\n"
                "    owner: runtime-tests\n"
                "    expires: '2099-01-01'\n"
                "    rationale: Preserve a focused stable-symbol waiver test.\n"
                "    remediation: Add declaration documentation later.\n",
                encoding="utf-8",
            )
            result = run_checker(root, expected=0, packet=packet, waivers=waivers)
        waived = [item for item in result["findings"] if item["severity"] == "waived"]
        self.assertEqual(len(waived), 1)
        self.assertEqual(waived[0]["declaration"], "value")
        self.assertEqual(result["status"], "passed")
        self.assertEqual(result["finding_count"], 1)
        self.assertEqual(result["finding_counts"]["waived"], 1)

    def test_symbol_waiver_survives_parameter_rename(self) -> None:
        """Keep waiver identity stable while signature intersection remains enforced."""
        overview = (
            '"""Responsibility: Provide parameter-independent waiver evidence.\n\n'
            'Context: This fixture proves signatures and waiver identity remain separate.\n"""\n\n'
        )
        before = overview + "def value(previous_name):\n    return previous_name\n"
        after = overview + "def value(current_name):\n    return current_name\n"
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            packet = change_packet(root, "service.py", before, after, [(6, 6)])
            waivers = root / "waivers.yaml"
            waivers.write_text(
                "version: 1\n"
                "owner: runtime-tests\n"
                "waivers:\n"
                "  - rule_id: SC005\n"
                "    path: service.py\n"
                "    declaration: value\n"
                "    owner: runtime-tests\n"
                "    expires: '2099-01-01'\n"
                "    rationale: Preserve parameter-independent stable identity.\n"
                "    remediation: Add declaration documentation later.\n",
                encoding="utf-8",
            )
            result = run_checker(root, expected=0, packet=packet, waivers=waivers)
        waived = [item for item in result["findings"] if item["severity"] == "waived"]
        self.assertEqual([item["declaration"] for item in waived], ["value"])

    def test_parser_backed_waiver_requires_declaration_key(self) -> None:
        """Fail closed when a Python waiver omits its stable declaration identity."""
        source = (
            '"""Responsibility: Provide malformed waiver validation evidence.\n\n'
            'Context: This fixture proves parser-backed waiver records fail closed.\n"""\n\n'
            "def value():\n"
            "    return 1\n"
        )
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            packet = change_packet(root, "service.py", None, source, [(1, 7)])
            waivers = root / "waivers.yaml"
            waivers.write_text(
                "version: 1\n"
                "owner: runtime-tests\n"
                "waivers:\n"
                "  - rule_id: SC005\n"
                "    path: service.py\n"
                "    owner: runtime-tests\n"
                "    expires: '2099-01-01'\n"
                "    rationale: Prove malformed waiver validation fails closed.\n"
                "    remediation: Add the stable declaration key.\n",
                encoding="utf-8",
            )
            result = run_checker(root, expected=1, packet=packet, waivers=waivers)
        integrity = [item for item in result["findings"] if item["rule_id"] == "SC010"]
        self.assertEqual(len(integrity), 1)
        self.assertIn("declaration", integrity[0]["message"])


if __name__ == "__main__":
    unittest.main()
