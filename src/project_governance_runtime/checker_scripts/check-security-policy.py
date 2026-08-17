#!/usr/bin/env python3
"""Scan selected repository after-images for deterministic embedded-secret signatures.

Responsibility: Detect supported secret signatures in immutable change-packet after-images or the
explicit exhaustive publishable surface, and apply only byte-exact, time-boxed waivers.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import subprocess
from datetime import date
from pathlib import Path, PurePosixPath
from typing import Any, BinaryIO, Optional

import yaml

from governance_changed_paths import changed_path_views
from governance_schema import validate_document
from finding_lifecycle import finding_summary


DETECTOR_PATTERNS = {
    "private-key": re.compile(rb"-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----"),
    "aws-secret-access-key": re.compile(
        rb"AWS_SECRET_ACCESS_KEY[\"'\]]{0,2}[ \t]{0,16}"
        rb"(?:[:=][ \t\r\n]{0,16}|[ \t]{1,16})[\"']?[A-Za-z0-9/+=]{40}"
    ),
    "github-token": re.compile(rb"ghp_[A-Za-z0-9]{36}"),
}
CHUNK_BYTES = 64 * 1024
PATTERN_OVERLAP_BYTES = 128
DEFAULT_WAIVERS = Path("config/policies/secret-waivers.yaml")
SHIPPED_DEFAULT_WAIVERS = (
    Path(__file__).resolve().parent.parent / "defaults/policies/secret-waivers.yaml"
)
SHIPPED_WAIVER_SCHEMA = (
    Path(__file__).resolve().parent.parent / "defaults/schemas/secret-waivers.schema.json"
)


def git_environment() -> dict[str, str]:
    """Disable replacement refs so Git reads the real index object ids."""
    environment = os.environ.copy()
    environment["GIT_NO_REPLACE_OBJECTS"] = "1"
    return environment


def git_output(*args: str) -> subprocess.CompletedProcess[bytes]:
    """Run one read-only Git query and retain its byte-exact output."""
    return subprocess.run(
        ["git", *args],
        env=git_environment(),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def git_metadata_present() -> bool:
    """Distinguish an ordinary non-Git directory from an inaccessible repository."""
    if os.environ.get("GIT_DIR"):
        return True
    for directory in (Path.cwd(), *Path.cwd().parents):
        try:
            (directory / ".git").lstat()
            return True
        except FileNotFoundError:
            continue
        except OSError:
            return True
    return False


def require_repository() -> None:
    """Fail closed unless the active directory is a usable Git working tree."""
    probe = git_output("rev-parse", "--is-inside-work-tree")
    if probe.returncode != 0 or probe.stdout.strip() != b"true":
        detail = probe.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"Git repository discovery failed: {detail or 'not inside a work tree'}")


def filesystem_paths() -> list[Path]:
    """Return regular non-symlink files when full scanning outside Git is explicit."""
    root = Path.cwd()
    return sorted(
        (
            path.relative_to(root)
            for path in root.rglob("*")
            if ".git" not in path.relative_to(root).parts
            and not path.is_symlink()
            and path.is_file()
        ),
        key=lambda path: path.as_posix(),
    )


def publishable_paths() -> list[Path]:
    """Return all tracked and nonignored untracked candidate paths for a full scan."""
    require_repository()
    result = git_output("ls-files", "--cached", "--others", "--exclude-standard", "-z")
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"Git candidate discovery failed: {detail or 'unknown error'}")
    return sorted(
        {Path(os.fsdecode(raw)) for raw in result.stdout.split(b"\0") if raw},
        key=lambda path: path.as_posix(),
    )


def parse_index_blobs(output: bytes, selected: set[Path] | None) -> list[tuple[Path, str]]:
    """Parse selected regular-file object ids from ``git ls-files --stage -z`` output."""
    blobs: set[tuple[Path, str]] = set()
    for record in output.split(b"\0"):
        if not record:
            continue
        try:
            metadata, raw_path = record.split(b"\t", 1)
            mode, object_id, _stage = metadata.split()
        except ValueError as exc:
            raise RuntimeError("Git returned malformed staged-index metadata") from exc
        path = Path(os.fsdecode(raw_path))
        if mode.startswith(b"100") and (selected is None or path in selected):
            blobs.add((path, object_id.decode("ascii")))
    return sorted(blobs, key=lambda item: (item[0].as_posix(), item[1]))


def index_blobs(selected: set[Path] | None) -> list[tuple[Path, str]]:
    """Return exact regular-file index blobs for selected paths or the whole index."""
    require_repository()
    result = git_output("ls-files", "--stage", "-z")
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"Git index discovery failed: {detail or 'unknown error'}")
    return parse_index_blobs(result.stdout, selected)


def stream_detections(
    stream: BinaryIO,
    byte_limit: Optional[int] = None,
) -> tuple[set[str], str]:
    """Find detector matches and hash one bounded byte stream in constant memory."""
    tail = b""
    found: set[str] = set()
    digest = hashlib.sha256()
    remaining = byte_limit
    while remaining is None or remaining > 0:
        chunk = stream.read(CHUNK_BYTES if remaining is None else min(CHUNK_BYTES, remaining))
        if not chunk:
            if remaining is not None:
                raise OSError("Git ended an index blob before its declared byte size")
            break
        digest.update(chunk)
        window = tail + chunk
        found.update(
            detector_id
            for detector_id, pattern in DETECTOR_PATTERNS.items()
            if pattern.search(window)
        )
        tail = window[-PATTERN_OVERLAP_BYTES:]
        if remaining is not None:
            remaining -= len(chunk)
    return found, digest.hexdigest()


def file_detections(path: Path) -> tuple[set[str], str] | None:
    """Scan one regular file without following a symlink at open time."""
    try:
        if not stat.S_ISREG(path.lstat().st_mode):
            return None
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        with os.fdopen(descriptor, "rb") as stream:
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                return None
            return stream_detections(stream)
    except FileNotFoundError:
        return None


def index_blob_detection_map(object_ids: set[str]) -> dict[str, tuple[set[str], str]]:
    """Stream all exact index blobs through one persistent Git batch process."""
    process = subprocess.Popen(
        ["git", "cat-file", "--batch"],
        env=git_environment(),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    if process.stdin is None or process.stdout is None:
        process.kill()
        process.wait()
        raise OSError("Git did not provide batch input and output streams")
    findings: dict[str, tuple[set[str], str]] = {}
    try:
        for object_id in sorted(object_ids):
            process.stdin.write(f"{object_id}\n".encode("ascii"))
            process.stdin.flush()
            header = process.stdout.readline().rstrip(b"\n").split()
            if len(header) != 3 or header[0] != object_id.encode("ascii") or header[1] != b"blob":
                raise OSError(f"git cat-file returned invalid metadata for object {object_id}")
            try:
                byte_size = int(header[2])
            except ValueError as exc:
                raise OSError(f"git cat-file returned an invalid size for object {object_id}") from exc
            findings[object_id] = stream_detections(process.stdout, byte_limit=byte_size)
            if process.stdout.read(1) != b"\n":
                raise OSError(f"git cat-file returned an invalid terminator for object {object_id}")
        process.stdin.close()
        if process.wait() != 0:
            raise OSError("git cat-file batch scan failed")
        return findings
    except (BrokenPipeError, OSError):
        process.kill()
        process.wait()
        raise
    finally:
        if not process.stdin.closed:
            process.stdin.close()
        process.stdout.close()


def exact_waiver_path(value: Any) -> str | None:
    """Return one normalized exact repo-relative path, rejecting patterns and traversal."""
    raw = str(value or "").strip()
    if (
        not raw
        or "\\" in raw
        or any(character in raw for character in "*?[")
        or any(ord(character) < 32 or ord(character) == 127 for character in raw)
    ):
        return None
    candidate = PurePosixPath(raw)
    if candidate.is_absolute() or raw != candidate.as_posix() or ".." in candidate.parts:
        return None
    if candidate.name in {"", ".", ".."}:
        return None
    return candidate.as_posix()


def waiver_finding(rule_id: str, message: str, *, path: str | None = None) -> dict[str, str]:
    """Create one blocking waiver-registry integrity finding."""
    finding = {"rule_id": rule_id, "severity": "blocking", "message": message}
    if path is not None:
        finding["path"] = path
    return finding


def load_waivers() -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """Load the optional target registry and fail closed on invalid or expired records."""
    registry_path = DEFAULT_WAIVERS if DEFAULT_WAIVERS.is_file() else SHIPPED_DEFAULT_WAIVERS
    label = DEFAULT_WAIVERS.as_posix() if registry_path == DEFAULT_WAIVERS else registry_path.name
    try:
        value = yaml.safe_load(registry_path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        return [], [waiver_finding("security.waiver-registry-invalid", f"{label}: {exc}")]
    schema_errors = validate_document(value, SHIPPED_WAIVER_SCHEMA, label)
    if schema_errors:
        detail = schema_errors[0]
        if len(schema_errors) > 1:
            detail += f" ({len(schema_errors)} registry errors total)"
        return [], [waiver_finding("security.waiver-registry-invalid", detail)]
    waivers: list[dict[str, Any]] = []
    findings: list[dict[str, str]] = []
    for index, raw_waiver in enumerate(value["waivers"], start=1):
        waiver = dict(raw_waiver)
        normalized_path = exact_waiver_path(waiver["path"])
        if normalized_path is None:
            findings.append(waiver_finding(
                "security.waiver-registry-invalid",
                f"{label}.waivers[{index - 1}].path: must be an exact normalized repository path",
            ))
            continue
        expiry = date.fromisoformat(str(waiver["expires"]))
        if expiry < date.today():
            findings.append(waiver_finding(
                "security.waiver-expired",
                f"secret waiver {index} expired on {expiry.isoformat()}",
                path=normalized_path,
            ))
            continue
        waiver["path"] = normalized_path
        waivers.append(waiver)
    return waivers, findings


def error_finding(message: str) -> dict[str, str]:
    """Represent a scan infrastructure failure as one blocking normalized finding."""
    return {
        "rule_id": "security.scan-unavailable",
        "severity": "blocking",
        "message": message,
    }


def add_detections(
    detections: dict[tuple[str, str], set[str]],
    path: Path,
    detector_ids: set[str],
    after_image_sha256: str,
) -> None:
    """Union secret-bearing image identities under stable path and detector keys."""
    for detector_id in detector_ids:
        detections.setdefault((path.as_posix(), detector_id), set()).add(after_image_sha256)


def scan_narrow(mode: str) -> tuple[dict[tuple[str, str], set[str]], list[dict[str, str]]]:
    """Scan each packet after-image exactly once for staged and changed selections."""
    detections: dict[tuple[str, str], set[str]] = {}
    findings: list[dict[str, str]] = []
    for repository_path, after_image, _is_new in changed_path_views(mode):
        try:
            result = file_detections(after_image)
        except OSError as exc:
            findings.append(error_finding(
                f"{repository_path}: packet after-image could not be scanned: {exc}"
            ))
            continue
        if result is None:
            findings.append(error_finding(
                f"{repository_path}: packet after-image is not a regular readable file"
            ))
            continue
        detector_ids, digest = result
        add_detections(detections, Path(repository_path), detector_ids, digest)
    return detections, findings


def scan_all() -> tuple[dict[tuple[str, str], set[str]], list[dict[str, str]]]:
    """Union exhaustive publishable worktree and index surfaces without source-shaped findings."""
    detections: dict[tuple[str, str], set[str]] = {}
    findings: list[dict[str, str]] = []
    try:
        paths = publishable_paths()
        blobs = index_blobs(None)
    except RuntimeError:
        if git_metadata_present():
            raise
        paths = filesystem_paths()
        blobs = []
    for relative in paths:
        try:
            result = file_detections(Path.cwd() / relative)
        except OSError as exc:
            findings.append(error_finding(
                f"{relative}: working-tree content could not be scanned: {exc}"
            ))
            continue
        if result is not None:
            detector_ids, digest = result
            add_detections(detections, relative, detector_ids, digest)
    if blobs:
        try:
            blob_map = index_blob_detection_map({object_id for _, object_id in blobs})
        except OSError as exc:
            findings.append(error_finding(f"staged index blobs could not be scanned: {exc}"))
        else:
            for relative, object_id in blobs:
                detector_ids, digest = blob_map[object_id]
                add_detections(detections, relative, detector_ids, digest)
    return detections, findings


def secret_findings(
    detections: dict[tuple[str, str], set[str]],
    waivers: list[dict[str, Any]],
) -> list[dict[str, str]]:
    """Format one finding per path and detector, suppressing only fully exact image matches."""
    findings: list[dict[str, str]] = []
    for (path, detector_id), image_digests in detections.items():
        waived_digests = {
            str(waiver["after_image_sha256"])
            for waiver in waivers
            if waiver["path"] == path and waiver["detector_id"] == detector_id
        }
        suppressed = image_digests <= waived_digests
        findings.append({
            "rule_id": "security.embedded-secret",
            "severity": "suppressed" if suppressed else "blocking",
            "path": path,
            "detector_id": detector_id,
            "message": (
                f"{detector_id} finding is suppressed by an exact current waiver"
                if suppressed
                else f"contains a value detected by {detector_id}"
            ),
        })
    return findings


def run_scan(mode: str) -> dict[str, object]:
    """Scan one selection and return its normalized fail-closed result."""
    waivers, findings = load_waivers()
    try:
        detections, scan_findings = scan_all() if mode == "all" else scan_narrow(mode)
        findings.extend(scan_findings)
        findings.extend(secret_findings(detections, waivers))
    except (OSError, RuntimeError, json.JSONDecodeError) as exc:
        findings.append(error_finding(f"repository discovery could not be completed: {exc}"))
    findings.sort(
        key=lambda finding: (
            finding.get("path", ""),
            finding["rule_id"],
            finding.get("detector_id", ""),
        )
    )
    return {
        "version": 1,
        "kind": "governance-check-result",
        **finding_summary(findings),
        "findings": findings,
    }


def main() -> int:
    """Parse one selection flag, emit JSON evidence, and mirror its terminal status."""
    parser = argparse.ArgumentParser(description=__doc__)
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--staged", action="store_true")
    selection.add_argument("--changed", action="store_true")
    selection.add_argument("--all", action="store_true")
    args = parser.parse_args()
    mode = "staged" if args.staged else "changed" if args.changed else "all"
    result = run_scan(mode)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 1 if result["status"] == "failed" else 0


if __name__ == "__main__":
    raise SystemExit(main())
