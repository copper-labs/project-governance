#!/usr/bin/env python3
"""Prove secret scanning uses exact selected bytes and exact, expiring waivers."""

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
CHECKER = ROOT / "src/project_governance_runtime/checker_scripts/check-security-policy.py"


def run(
    command: list[str],
    root: Path,
    *,
    expected: int,
    environment: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run one fixture command and retain diagnostics when its expected exit code changes."""
    result = subprocess.run(
        command,
        cwd=root,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != expected:
        raise AssertionError(
            f"expected {expected}, got {result.returncode}: {' '.join(command)}\n"
            f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return result


def initialize_repository(root: Path) -> None:
    """Create one committed baseline for deterministic index and branch fixtures."""
    run(["git", "init", "-q", "-b", "main"], root, expected=0)
    run(["git", "config", "user.email", "tests@example.invalid"], root, expected=0)
    run(["git", "config", "user.name", "Runtime Tests"], root, expected=0)
    (root / "baseline.txt").write_text("safe baseline\n", encoding="utf-8")
    run(["git", "add", "baseline.txt"], root, expected=0)
    run(["git", "commit", "-qm", "baseline"], root, expected=0)


def scan(
    root: Path,
    mode: str,
    *,
    expected: int,
    environment: dict[str, str] | None = None,
) -> dict[str, object]:
    """Execute the direct checker and parse its normalized JSON evidence."""
    result = run(
        [sys.executable, str(CHECKER), mode],
        root,
        expected=expected,
        environment=environment,
    )
    payload = json.loads(result.stdout)
    if not isinstance(payload, dict):
        raise AssertionError(f"checker returned a non-object payload: {payload!r}")
    return payload


def index_bytes(root: Path, path: str) -> bytes:
    """Read one exact staged blob for packet construction."""
    result = subprocess.run(
        ["git", "show", f":{path}"],
        cwd=root,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise AssertionError(result.stderr.decode(errors="replace"))
    return result.stdout


def packet(root: Path, mode: str, after_images: dict[str, bytes]) -> dict[str, str]:
    """Materialize exact runner-owned after-images for one direct-checker fixture."""
    packet_root = root / ".git/project-governance-secret-test"
    packet_root.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, object]] = []
    for index, (path, content) in enumerate(after_images.items()):
        after_path = packet_root / f"after-{index}"
        after_path.write_bytes(content)
        records.append({
            "status": "added",
            "path": path,
            "previous_path": None,
            "before_path": None,
            "after_path": str(after_path.resolve()),
            "changed_ranges": [{"start": 1, "end": 1}],
        })
    packet_path = packet_root / "change-packet.json"
    packet_path.write_text(json.dumps({
        "kind": "project-governance-change-packet",
        "version": 1,
        "scope": "changed",
        "mode": mode,
        "base_ref": "fixture",
        "records": records,
    }, sort_keys=True), encoding="utf-8")
    return {"PROJECT_GOVERNANCE_CHANGE_PACKET": str(packet_path.resolve())}


def write_waivers(root: Path, waivers: list[dict[str, str]], **extra: object) -> None:
    """Write one target-owned waiver registry as JSON-compatible YAML."""
    policy = root / "config/policies/secret-waivers.yaml"
    policy.parent.mkdir(parents=True, exist_ok=True)
    policy.write_text(json.dumps({
        "version": 1,
        "owner": "security-team",
        "waivers": waivers,
        **extra,
    }), encoding="utf-8")


def waiver(path: str, detector_id: str, content: bytes, *, expires: str = "2099-01-01") -> dict[str, str]:
    """Build one complete byte-exact waiver record."""
    return {
        "path": path,
        "detector_id": detector_id,
        "after_image_sha256": hashlib.sha256(content).hexdigest(),
        "owner": "security-team",
        "rationale": "This synthetic credential-shaped fixture is required for scanner validation.",
        "expires": expires,
    }


class RuntimeSecretScanTests(unittest.TestCase):
    """Exercise packet scope, exhaustive scope, detector identity, and waivers."""

    def test_staged_scans_only_packet_after_images_once(self) -> None:
        """Exclude unstaged-only and unrelated content from the staged pre-commit boundary."""
        marker = ("gh" + "p_" + "a" * 36).encode()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize_repository(root)
            staged_secret = root / "staged-secret.txt"
            staged_secret.write_bytes(marker)
            run(["git", "add", staged_secret.name], root, expected=0)
            staged_image = index_bytes(root, staged_secret.name)
            staged_secret.write_text("clean worktree\n", encoding="utf-8")
            dirty_secret = root / "dirty-secret.txt"
            dirty_secret.write_text("clean index\n", encoding="utf-8")
            run(["git", "add", dirty_secret.name], root, expected=0)
            dirty_image = index_bytes(root, dirty_secret.name)
            dirty_secret.write_bytes(marker)
            (root / "unrelated-secret.txt").write_bytes(marker)

            payload = scan(
                root,
                "--staged",
                expected=1,
                environment={
                    **os.environ,
                    **packet(root, "staged", {
                        staged_secret.name: staged_image,
                        dirty_secret.name: dirty_image,
                    }),
                },
            )

        self.assertEqual(payload["status"], "failed")
        self.assertEqual(payload["finding_count"], 1)
        self.assertEqual(payload["findings"][0]["path"], "staged-secret.txt")
        self.assertEqual(payload["findings"][0]["detector_id"], "github-token")
        self.assertNotIn("source", payload["findings"][0])

    def test_changed_scans_only_packet_after_image(self) -> None:
        """Keep branch-aware selection isolated from unrelated local content."""
        marker = ("gh" + "p_" + "b" * 36).encode()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize_repository(root)
            (root / "branch-secret.txt").write_bytes(marker)
            (root / "untracked-secret.txt").write_bytes(marker)
            environment = {
                **os.environ,
                **packet(root, "changed", {"branch-secret.txt": marker}),
            }

            payload = scan(root, "--changed", expected=1, environment=environment)

        self.assertEqual(payload["finding_count"], 1)
        self.assertEqual(payload["findings"][0]["path"], "branch-secret.txt")
        self.assertNotIn("source", payload["findings"][0])

    def test_all_unions_worktree_and_index_without_source_dimension(self) -> None:
        """Catch untracked and index-only bytes while deduplicating matching surfaces."""
        marker = ("gh" + "p_" + "c" * 36).encode()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize_repository(root)
            indexed_secret = root / "indexed-secret.txt"
            indexed_secret.write_bytes(marker)
            run(["git", "add", indexed_secret.name], root, expected=0)
            indexed_secret.write_text("clean worktree\n", encoding="utf-8")
            (root / "untracked-secret.txt").write_bytes(marker)
            duplicate = root / "duplicate-secret.txt"
            duplicate.write_bytes(marker)
            run(["git", "add", duplicate.name], root, expected=0)

            payload = scan(root, "--all", expected=1)

        self.assertEqual(payload["finding_count"], 3)
        findings = payload["findings"]
        self.assertEqual(
            {(item["path"], item["detector_id"]) for item in findings},
            {
                ("duplicate-secret.txt", "github-token"),
                ("indexed-secret.txt", "github-token"),
                ("untracked-secret.txt", "github-token"),
            },
        )
        self.assertTrue(all("source" not in item for item in findings))

    def test_reports_stable_detector_ids_without_literal_marker_identity(self) -> None:
        """Emit one finding for each stable detector rather than matched marker text."""
        content = (
            b"-----BEGIN " + b"PRIVATE KEY-----\n"
            b"AWS_SECRET_ACCESS_KEY=" + b"A" * 40 + b"\n"
            + ("gh" + "p_" + "d" * 36).encode()
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize_repository(root)
            environment = {**os.environ, **packet(root, "changed", {"secrets.txt": content})}

            payload = scan(root, "--changed", expected=1, environment=environment)

        self.assertEqual(
            {item["detector_id"] for item in payload["findings"]},
            {"private-key", "aws-secret-access-key", "github-token"},
        )
        self.assertTrue(all("marker" not in item for item in payload["findings"]))
        self.assertNotIn(("gh" + "p_" + "d" * 36), json.dumps(payload))

    def test_exact_current_waiver_suppresses_and_remains_visible(self) -> None:
        """Downgrade only the exact path, detector, and after-image bytes."""
        content = ("gh" + "p_" + "e" * 36).encode()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize_repository(root)
            write_waivers(root, [waiver("fixture.txt", "github-token", content)])
            environment = {**os.environ, **packet(root, "changed", {"fixture.txt": content})}

            payload = scan(root, "--changed", expected=0, environment=environment)

        self.assertEqual(payload["status"], "passed")
        self.assertEqual(payload["finding_count"], 1)
        self.assertEqual(payload["finding_counts"]["suppressed"], 1)
        self.assertEqual(payload["findings"][0]["severity"], "suppressed")

    def test_byte_change_cannot_reuse_waiver(self) -> None:
        """Reopen an exact waiver whenever any after-image byte changes."""
        original = ("gh" + "p_" + "f" * 36).encode()
        changed = original + b"\nchanged\n"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize_repository(root)
            write_waivers(root, [waiver("fixture.txt", "github-token", original)])
            environment = {**os.environ, **packet(root, "changed", {"fixture.txt": changed})}

            payload = scan(root, "--changed", expected=1, environment=environment)

        self.assertEqual(payload["findings"][0]["severity"], "blocking")

    def test_path_or_detector_mismatch_cannot_reuse_waiver(self) -> None:
        """Keep exception identity bound to both repository location and detector contract."""
        content = ("gh" + "p_" + "i" * 36).encode()
        mismatches = (
            waiver("other.txt", "github-token", content),
            waiver("fixture.txt", "private-key", content),
        )
        for mismatched in mismatches:
            with self.subTest(mismatched=mismatched):
                with tempfile.TemporaryDirectory() as directory:
                    root = Path(directory)
                    initialize_repository(root)
                    write_waivers(root, [mismatched])
                    environment = {
                        **os.environ,
                        **packet(root, "changed", {"fixture.txt": content}),
                    }

                    payload = scan(root, "--changed", expected=1, environment=environment)

                self.assertEqual(payload["findings"][0]["severity"], "blocking")

    def test_invalid_present_registry_fails_closed(self) -> None:
        """Reject extra fields through the shipped closed schema."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize_repository(root)
            write_waivers(root, [], unexpected=True)
            environment = {**os.environ, **packet(root, "changed", {})}

            payload = scan(root, "--changed", expected=1, environment=environment)

        self.assertEqual(payload["findings"][0]["rule_id"], "security.waiver-registry-invalid")

    def test_expired_waiver_blocks_even_without_current_secret(self) -> None:
        """Keep expired policy records visible as integrity failures."""
        content = ("gh" + "p_" + "g" * 36).encode()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize_repository(root)
            write_waivers(root, [waiver(
                "fixture.txt", "github-token", content, expires="2000-01-01"
            )])
            environment = {**os.environ, **packet(root, "changed", {})}

            payload = scan(root, "--changed", expected=1, environment=environment)

        self.assertEqual(payload["findings"][0]["rule_id"], "security.waiver-expired")

    def test_unknown_detector_id_is_malformed(self) -> None:
        """Reject detector names outside the stable public contract."""
        content = ("gh" + "p_" + "j" * 36).encode()
        record = waiver("fixture.txt", "github-token", content)
        record["detector_id"] = "generic-token"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize_repository(root)
            write_waivers(root, [record])
            environment = {**os.environ, **packet(root, "changed", {})}

            payload = scan(root, "--changed", expected=1, environment=environment)

        self.assertEqual(payload["findings"][0]["rule_id"], "security.waiver-registry-invalid")

    def test_unsafe_waiver_path_fails_closed(self) -> None:
        """Reject globs instead of broadening a byte-exact exception."""
        content = ("gh" + "p_" + "h" * 36).encode()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize_repository(root)
            write_waivers(root, [waiver("fixtures/*.txt", "github-token", content)])
            environment = {**os.environ, **packet(root, "changed", {})}

            payload = scan(root, "--changed", expected=1, environment=environment)

        self.assertEqual(payload["findings"][0]["rule_id"], "security.waiver-registry-invalid")


if __name__ == "__main__":
    unittest.main()
