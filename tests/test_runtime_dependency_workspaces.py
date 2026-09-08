"""Prove local npm workspace exemptions preserve external publication checks."""

from __future__ import annotations

import contextlib
import json
import os
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

import test_runtime_dependency_checker as dependency_tests


class RuntimeDependencyWorkspaceTests(unittest.TestCase):
    """Exercise workspace resolution through the packaged dependency checker."""

    _fixture = dependency_tests.RuntimeDependencyCheckerTests._fixture
    _run_checker = staticmethod(dependency_tests.RuntimeDependencyCheckerTests._run_checker)
    _write_policy_files = dependency_tests.RuntimeDependencyCheckerTests._write_policy_files
    _npm_evidence = staticmethod(dependency_tests.RuntimeDependencyCheckerTests._npm_evidence)
    _write_evidence = staticmethod(dependency_tests.RuntimeDependencyCheckerTests._write_evidence)

    def test_declared_workspace_exact_dependency_needs_no_publication(self) -> None:
        for patterns in (["apps/*", "packages/*"], {"packages": ["apps/**", "packages/local"]}, ["apps/dem?", "**/local"]):
            with self.subTest(patterns=patterns), self._workspace_fixture(patterns=patterns) as root:
                code, report = self._run_checker(root)
                self.assertEqual(code, 0, report)
                consumer = next(item for item in report["checked"] if item["path"] == "apps/demo/package.json")
                self.assertEqual(consumer["status"], "local-workspace")
                self.assertEqual(consumer["local_workspace_dependency_count"], 1)

    def test_workspace_exemption_requires_membership_name_and_version(self) -> None:
        cases = [
            {"patterns": ["apps/*"]},
            {"patterns": ["apps/*", "packages/*", "!packages/local"]},
            {"patterns": ["packages/*"]},
            {"package": {"name": "@example/other", "version": "1.0.0-beta.1"}},
            {"package": {"name": "@example/local", "version": "1.0.0-beta.2"}},
            {"package": None},
            {"duplicate": True},
            {"patterns": ["*/local"]},
        ]
        for case in cases:
            with self.subTest(case=case), self._workspace_fixture(**case) as root:
                code, report = self._run_checker(root)
                self.assertEqual(code, 1, report)
                self.assertEqual(report["findings"][0]["rule_id"], "dependency.evidence-missing")

    def test_external_coordinate_stays_checked_alongside_workspace(self) -> None:
        with self._workspace_fixture(external=True) as root:
            code, report = self._run_checker(root)
            self.assertEqual(code, 1, report)
            self.assertEqual(report["finding_count"], 1)
            self.assertIn("@example/external", report["findings"][0]["message"])
            self._write_evidence(root, [self._npm_evidence("@example/external", "2.0.0")])
            code, report = self._run_checker(root)
            self.assertEqual(code, 0, report)

    def test_workspace_membership_uses_packet_bytes_not_unstaged_edits(self) -> None:
        for valid in (True, False):
            with self.subTest(valid=valid), self._workspace_fixture(
                mode="staged", patterns=["apps/*", "packages/*"] if valid else []
            ) as root:
                (root / "package.json").write_text(json.dumps({"workspaces": [] if valid else ["apps/*", "packages/*"]}))
                code, report = self._run_checker(root, mode="staged")
                self.assertEqual(code, 0 if valid else 1, report)

    def test_workspace_metadata_can_come_from_unchanged_base(self) -> None:
        with self._workspace_fixture() as root:
            subprocess.run(["git", "add", "package.json", "packages"], cwd=root, check=True, capture_output=True)
            subprocess.run(["git", "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "Workspace baseline"], cwd=root, check=True, capture_output=True)
            packet_path = root / ".packet/change-packet.json"
            packet = json.loads(packet_path.read_text())
            packet["base_ref"] = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
            packet["records"] = [record for record in packet["records"] if record["path"].startswith("apps/")]
            packet_path.write_text(json.dumps(packet))
            (root / "packages/local/package.json").write_text('{}')
            code, report = self._run_checker(root)
            self.assertEqual(code, 0, report)

    def test_all_mode_resolves_declared_workspace(self) -> None:
        for with_packet in (True, False):
            with self.subTest(with_packet=with_packet), self._workspace_fixture() as root:
                packet_path = root / ".packet/change-packet.json"
                packet_path.write_text(json.dumps({
                    "kind": "project-governance-change-packet", "version": 1,
                    "scope": "all", "mode": "all", "base_ref": None, "records": [],
                }))
                with patch.dict(os.environ):
                    if not with_packet:
                        os.environ.pop("PROJECT_GOVERNANCE_CHANGE_PACKET", None)
                    code, report = self._run_checker(root, mode="all", arguments=["--all", "--path", "apps/demo/package.json"])
                self.assertEqual(code, 0, report)

    def test_root_consumer_can_resolve_local_workspace(self) -> None:
        with self._workspace_fixture() as root:
            packet = json.loads((root / ".packet/change-packet.json").read_text())
            record = next(item for item in packet["records"] if item["path"] == "package.json")
            path = Path(record["after_path"])
            manifest = json.loads(path.read_text())
            manifest["dependencies"] = {"@example/local": "1.0.0-beta.1"}
            path.write_text(json.dumps(manifest))
            code, report = self._run_checker(root)
            self.assertEqual(code, 0, report)

    def test_explicit_consumer_selection_still_reads_workspace_subject(self) -> None:
        with self._workspace_fixture() as root:
            code, report = self._run_checker(root, arguments=["--changed", "--path", "apps/demo/package.json"])
            self.assertEqual(code, 0, report)

    def test_deleted_and_symlink_workspace_members_do_not_exempt(self) -> None:
        for kind in ("deleted", "symlink"):
            with self.subTest(kind=kind), self._workspace_fixture() as root:
                packet_path = root / ".packet/change-packet.json"
                packet = json.loads(packet_path.read_text())
                record = next(item for item in packet["records"] if item["path"] == "packages/local/package.json")
                if kind == "deleted":
                    record.update(status="deleted", before_path=record["after_path"], before_file_type="regular", after_path=None, after_file_type=None)
                else:
                    record["after_file_type"] = "symlink"
                packet_path.write_text(json.dumps(packet))
                code, report = self._run_checker(root, arguments=["--changed", "--path", "apps/demo/package.json"])
                self.assertEqual(code, 1, report)
                self.assertEqual(report["findings"][0]["rule_id"], "dependency.evidence-missing")

    def test_override_of_local_name_still_requires_external_evidence(self) -> None:
        with self._workspace_fixture() as root:
            packet = json.loads((root / ".packet/change-packet.json").read_text())
            record = next(item for item in packet["records"] if item["path"] == "apps/demo/package.json")
            Path(record["after_path"]).write_text(json.dumps({"overrides": {"@example/local": "1.0.0-beta.1"}}))
            code, report = self._run_checker(root)
            self.assertEqual(code, 1, report)
            self.assertIn("override", report["findings"][0]["message"])

    @contextlib.contextmanager
    def _workspace_fixture(self, *, patterns=None, package="default", duplicate=False, external=False, mode="changed"):
        dependencies = {"@example/local": "1.0.0-beta.1"}
        if external:
            dependencies["@example/external"] = "2.0.0"
        if package == "default":
            package = {"name": "@example/local", "version": "1.0.0-beta.1"}
        manifests = {
            "package.json": (None, json.dumps({"workspaces": ["apps/*", "packages/*"] if patterns is None else patterns})),
            "apps/demo/package.json": (None, json.dumps({"name": "demo", "dependencies": dependencies})),
        }
        if package is not None:
            manifests["packages/local/package.json"] = (None, json.dumps(package))
        if duplicate:
            manifests["packages/duplicate/package.json"] = (None, json.dumps(package))
        with self._fixture(manifests, mode=mode) as root:
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            subprocess.run(["git", "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "Empty baseline"], cwd=root, check=True, capture_output=True)
            packet_path = root / ".packet/change-packet.json"
            packet = json.loads(packet_path.read_text())
            packet["base_ref"] = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
            for record in packet["records"]:
                record["after_file_type"] = "regular"
            packet_path.write_text(json.dumps(packet))
            yield root
