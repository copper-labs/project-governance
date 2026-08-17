#!/usr/bin/env python3
"""Prove pack evidence manifests stay bounded, isolated, and digest-only."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from project_governance_runtime.evidence_manifest import (  # noqa: E402
    MANIFEST_NAME,
    MAX_MANIFEST_BYTES,
    inspect_evidence_manifest,
)

SUBJECT_DIGEST = "sha256:" + "1" * 64
ARTIFACT_DIGEST = "sha256:" + "2" * 64


def manifest() -> dict[str, object]:
    """Return one minimal valid manifest fixture."""
    return {
        "kind": "project-governance-evidence-manifest",
        "version": 1,
        "subject_digest": SUBJECT_DIGEST,
        "claims": [
            {
                "id": "tests.unit",
                "outcome": "passed",
                "artifact_digests": [ARTIFACT_DIGEST],
            }
        ],
    }


class RuntimeEvidenceManifestTests(unittest.TestCase):
    """Accept only one bounded manifest from the current pack evidence root."""

    def test_absent_manifest_is_validly_not_present(self) -> None:
        """Do not require a pack to opt into evidence claims."""
        with tempfile.TemporaryDirectory() as directory:
            result = inspect_evidence_manifest(Path(directory), SUBJECT_DIGEST)

        self.assertEqual(
            result,
            {
                "status": "absent",
                "manifest_digest": None,
                "claim_count": 0,
                "artifact_digest_count": 0,
                "findings": [],
            },
        )

    def test_valid_manifest_reports_digest_and_bounded_counts(self) -> None:
        """Summarize claims without copying their contents into runner evidence."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            payload = json.dumps(manifest(), sort_keys=True).encode("utf-8")
            (root / MANIFEST_NAME).write_bytes(payload)

            result = inspect_evidence_manifest(root, SUBJECT_DIGEST)

        self.assertEqual(result["status"], "valid")
        self.assertRegex(result["manifest_digest"], r"^sha256:[0-9a-f]{64}$")
        self.assertEqual(result["claim_count"], 1)
        self.assertEqual(result["artifact_digest_count"], 1)
        self.assertEqual(result["findings"], [])

    def test_subject_mismatch_is_one_blocking_finding(self) -> None:
        """Bind claims to the exact immutable run subject."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / MANIFEST_NAME).write_text(json.dumps(manifest()), encoding="utf-8")
            result = inspect_evidence_manifest(root, "sha256:" + "3" * 64)

        self.assert_invalid(result, "subject_digest")

    def test_present_manifest_requires_a_content_bound_subject(self) -> None:
        """Never accept a manifest when the run lacks an immutable comparison digest."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / MANIFEST_NAME).write_text(json.dumps(manifest()), encoding="utf-8")
            result = inspect_evidence_manifest(root, None)

        self.assert_invalid(result, "content-bound")

    def test_malformed_and_extra_keys_are_rejected(self) -> None:
        """Reject both invalid JSON and extensions outside the closed schema."""
        cases: list[bytes] = [b"{not-json"]
        with_extra = manifest()
        with_extra["artifact_path"] = "private/output.txt"
        cases.append(json.dumps(with_extra).encode("utf-8"))

        for payload in cases:
            with self.subTest(
                payload=payload[:20]
            ), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / MANIFEST_NAME).write_bytes(payload)
                result = inspect_evidence_manifest(root, SUBJECT_DIGEST)
                self.assert_invalid(result)

    def test_oversized_manifest_is_rejected_before_json_parse(self) -> None:
        """Bound untrusted bytes before allocating a JSON document."""
        with tempfile.TemporaryDirectory() as directory, patch(
            "project_governance_runtime.evidence_manifest.json.loads"
        ) as parse:
            root = Path(directory)
            (root / MANIFEST_NAME).write_bytes(b" " * (MAX_MANIFEST_BYTES + 1))
            result = inspect_evidence_manifest(root, SUBJECT_DIGEST)

        self.assert_invalid(result, "exceeds")
        parse.assert_not_called()

    def test_duplicate_claim_ids_are_rejected(self) -> None:
        """Keep claim identities stable even when otherwise valid objects differ."""
        value = manifest()
        value["claims"].append(
            {  # type: ignore[union-attr]
                "id": "tests.unit",
                "outcome": "failed",
                "artifact_digests": [],
            }
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / MANIFEST_NAME).write_text(json.dumps(value), encoding="utf-8")
            result = inspect_evidence_manifest(root, SUBJECT_DIGEST)

        self.assert_invalid(result, "unique")

    def test_referenced_artifacts_are_never_read(self) -> None:
        """Treat artifact digests as inert claims, not paths to pack output."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / MANIFEST_NAME).write_text(json.dumps(manifest()), encoding="utf-8")
            artifact = root / "private-artifact.bin"
            artifact.write_bytes(b"must not be read")

            original_open = Path.open

            def guarded_open(path: Path, *args: object, **kwargs: object):
                if path == artifact:
                    raise AssertionError("artifact content was read")
                return original_open(path, *args, **kwargs)

            with patch("pathlib.Path.open", guarded_open):
                result = inspect_evidence_manifest(root, SUBJECT_DIGEST)

        self.assertEqual(result["status"], "valid")

    def assert_invalid(
        self, result: dict[str, object], message: str | None = None
    ) -> None:
        """Assert the stable invalid-result envelope and its sole finding."""
        self.assertEqual(result["status"], "invalid")
        self.assertIsNone(result["manifest_digest"])
        self.assertEqual(result["claim_count"], 0)
        self.assertEqual(result["artifact_digest_count"], 0)
        findings = result["findings"]
        self.assertIsInstance(findings, list)
        self.assertEqual(len(findings), 1)  # type: ignore[arg-type]
        finding = findings[0]  # type: ignore[index]
        self.assertEqual(finding["severity"], "blocking")
        if message is not None:
            self.assertIn(message, finding["message"])


if __name__ == "__main__":
    unittest.main()
