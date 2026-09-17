"""Prove dependency installation rejects unapproved artifacts and incomplete closures."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "src/project_governance_runtime/assets"


def fixture_wheel(directory: Path, name: str, dependency: str = "") -> Path:
    """Create an offline package so pip itself proves transitive hash enforcement."""
    wheel = directory / f"{name}-1.0-py3-none-any.whl"
    with zipfile.ZipFile(wheel, "w") as archive:
        metadata = f"Metadata-Version: 2.1\nName: {name}\nVersion: 1.0\n"
        if dependency:
            metadata += f"Requires-Dist: {dependency}\n"
        archive.writestr(f"{name}-1.0.dist-info/METADATA", metadata)
        archive.writestr(f"{name}-1.0.dist-info/WHEEL", "Wheel-Version: 1.0\nGenerator: fixture\nRoot-Is-Purelib: true\nTag: py3-none-any\n")
        archive.writestr(f"{name}-1.0.dist-info/RECORD", "")
    return wheel


class DependencyLockTests(unittest.TestCase):
    """Exercise real pip rejection and the verified-wheel bootstrap boundary."""

    def test_pip_rejects_missing_transitive_pin_and_wrong_hash(self):
        """Offline resolution accepts only the complete approved dependency closure."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            parent = fixture_wheel(root, "parent_fixture", "child-fixture>=1")
            child = fixture_wheel(root, "child_fixture")
            parent_line = "parent-fixture==1.0 --hash=sha256:" + hashlib.sha256(parent.read_bytes()).hexdigest()
            child_line = "child-fixture==1.0 --hash=sha256:" + hashlib.sha256(child.read_bytes()).hexdigest()
            requirements = root / "requirements.txt"
            for text, success in [(parent_line, False), (parent_line + "\nchild-fixture==1.0 --hash=sha256:" + "0" * 64, False), (parent_line + "\n" + child_line, True)]:
                requirements.write_text(text + "\n")
                result = subprocess.run([sys.executable, "-m", "pip", "--isolated", "download", "--no-index", "--find-links", str(root), "--require-hashes", "--only-binary=:all:", "-r", str(requirements), "--dest", str(root / "downloads")], capture_output=True, text=True)
                self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)

    def test_startup_uses_candidate_lock_and_existing_deadline(self):
        """Startup cannot fall back to range resolution when a candidate omits its lock."""
        with patch.object(sys, "path", [str(ROOT / "src"), *sys.path]):
            from project_governance_runtime import startup_installation as startup
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            wheel = fixture_wheel(root, "project_governance_runtime")
            with patch.object(startup, "_run") as run:
                with self.assertRaisesRegex(startup.StartupError, "no runtime dependency lock"):
                    startup.install_dependencies(root, wheel, "a" * 64, "python", 123)
                run.assert_not_called()
                with zipfile.ZipFile(wheel, "a") as archive:
                    archive.writestr("project_governance_runtime/assets/runtime-requirements.txt", "example==1.0 --hash=sha256:" + "b" * 64)
                def capture(arguments, actual_root, deadline):
                    self.assertEqual((actual_root, deadline), (root, 123))
                    self.assertIn("--require-hashes", arguments)
                    self.assertIn("--only-binary=:all:", arguments)
                    self.assertIn("b" * 64, Path(arguments[arguments.index("-r") + 1]).read_text())
                run.side_effect = capture
                startup.install_dependencies(root, wheel, "a" * 64, "python", 123)
                run.assert_called_once()

    def test_bootstrap_reads_lock_from_verified_wheel(self):
        """A missing embedded lock fails before environment creation; valid bytes reach hash mode."""
        spec = importlib.util.spec_from_file_location("bootstrap", ASSETS / "tools/governance-bootstrap.py")
        bootstrap = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(bootstrap)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            wheel = fixture_wheel(root, "project_governance_runtime")
            lock_path = root / "lock.json"
            def write_lock():
                lock_path.write_text(json.dumps({"wheel": wheel.name, "release_base_url": "https://example.invalid", "source_commit": "a" * 40, "wheel_url": wheel.as_uri(), "version": "1.0", "sha256": hashlib.sha256(wheel.read_bytes()).hexdigest()}))
            write_lock()
            with patch.object(bootstrap, "LOCK_PATH", lock_path), patch.object(bootstrap, "ROOT", root), patch.object(bootstrap.subprocess, "run") as run:
                with self.assertRaisesRegex(SystemExit, "no dependency lock"):
                    bootstrap.install_locked(root / "runtime")
                run.assert_not_called()
                dependencies = "example==1.0 --hash=sha256:" + "a" * 64 + "\n"
                with zipfile.ZipFile(wheel, "a") as archive:
                    archive.writestr("project_governance_runtime/assets/runtime-requirements.txt", dependencies)
                write_lock()
                def capture(arguments, **kwargs):
                    if "--require-hashes" in arguments:
                        contents = Path(arguments[arguments.index("-r") + 1]).read_text()
                        self.assertIn(dependencies, contents)
                        self.assertIn(hashlib.sha256(wheel.read_bytes()).hexdigest(), contents)
                        self.assertIn("--only-binary=:all:", arguments)
                    return subprocess.CompletedProcess(arguments, 0)
                run.side_effect = capture
                self.assertEqual(bootstrap.install_locked(root / "runtime"), 0)
                self.assertTrue(any("--require-hashes" in call.args[0] for call in run.call_args_list))


if __name__ == "__main__":
    unittest.main()
