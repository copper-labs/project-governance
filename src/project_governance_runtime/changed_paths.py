"""Resolve one exact Git comparison for every impacted governance check."""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import subprocess
from pathlib import Path
from typing import Any


PACKET_KIND = "project-governance-change-packet"
PACKET_VERSION = 1


class ChangedPathError(RuntimeError):
    """Report a Git resolution failure that would make impact selection unsafe."""


def subject_digest(records: list[dict[str, Any]]) -> str:
    """Bind one digest to logical comparison records, never materialized paths.

    Git blob object IDs may be SHA-1 while worktree identities use SHA256. This
    digest is therefore stable for one exact repository subject, not a portable
    content identity across repositories or Git object formats.
    """
    logical_records = sorted(
        [
            {
                "status": record["status"],
                "path": record["path"],
                "previous_path": record.get("previous_path"),
                "before_identity": (
                    record.get("before", {}).get("identity")
                    if record.get("before") is not None
                    else None
                ),
                "after_identity": (
                    record.get("after", {}).get("identity")
                    if record.get("after") is not None
                    else None
                ),
                "before_file_type": (
                    record.get("before", {}).get("file_type")
                    if record.get("before") is not None
                    else None
                ),
                "after_file_type": (
                    record.get("after", {}).get("file_type")
                    if record.get("after") is not None
                    else None
                ),
                "changed_ranges": record.get("changed_ranges", []),
            }
            for record in records
        ],
        key=lambda item: (
            item["path"],
            item["status"],
            item["previous_path"] or "",
        ),
    )
    body = json.dumps(logical_records, sort_keys=True, separators=(",", ":"))
    return f"sha256:{hashlib.sha256(body.encode('utf-8')).hexdigest()}"


def scope_subject_digest(scope: dict[str, Any]) -> str | None:
    """Return an exact changed subject identity, or none for checkout-wide all mode."""
    if scope.get("scope") == "all":
        return None
    return subject_digest(scope.get("records", []))


def _git_bytes(root: Path, arguments: list[str]) -> bytes:
    """Run one read-only Git command and return its byte-exact output."""
    result = subprocess.run(
        ["git", *arguments],
        cwd=root,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", errors="replace").strip()
        raise ChangedPathError(detail or f"git {' '.join(arguments)} failed")
    return result.stdout


def _git(root: Path, arguments: list[str]) -> str:
    """Run one read-only Git command and decode ordinary textual output."""
    return _git_bytes(root, arguments).decode("utf-8", errors="surrogateescape")


def _verified_commit(root: Path, reference: str) -> str:
    """Resolve one explicit commit-like reference without guessing another base."""
    try:
        return _git(root, ["rev-parse", "--verify", f"{reference}^{{commit}}"]).strip()
    except ChangedPathError as error:
        raise ChangedPathError(f"comparison base {reference!r} is unavailable") from error


def _base_commit(root: Path, explicit: str | None = None) -> str:
    """Resolve the explicit base or configured upstream merge-base and nothing broader."""
    reference = (explicit or os.environ.get("GOVERNANCE_BASE_REF", "")).strip()
    if not reference:
        reference = "@{upstream}"
    commit = _verified_commit(root, reference)
    try:
        return _git(root, ["merge-base", "HEAD", commit]).strip()
    except ChangedPathError as error:
        raise ChangedPathError(
            f"comparison subject cannot resolve a merge-base with {reference!r}"
        ) from error


def _safe_path(value: str) -> str:
    """Normalize one repository-relative Git path and reject path traversal."""
    path = Path(value)
    if not value or path.is_absolute() or ".." in path.parts:
        raise ChangedPathError(f"Git returned an unsafe changed path: {value!r}")
    return path.as_posix()


def _name_status_records(output: bytes) -> list[dict[str, Any]]:
    """Parse NUL-delimited Git status while retaining rename and delete identity."""
    tokens = [os.fsdecode(value) for value in output.split(b"\0") if value]
    records: list[dict[str, Any]] = []
    index = 0
    while index < len(tokens):
        raw_status = tokens[index]
        index += 1
        code = raw_status[:1]
        if code in {"R", "C"}:
            if index + 1 >= len(tokens):
                raise ChangedPathError("Git returned an incomplete rename record")
            previous_path = _safe_path(tokens[index])
            path = _safe_path(tokens[index + 1])
            index += 2
            records.append({
                "status": "renamed",
                "path": path,
                "previous_path": previous_path,
            })
            continue
        if index >= len(tokens):
            raise ChangedPathError("Git returned an incomplete changed-path record")
        path = _safe_path(tokens[index])
        index += 1
        records.append({
            "status": "added" if code == "A" else "deleted" if code == "D" else "modified",
            "path": path,
            "previous_path": None,
        })
    return records


def _diff_ranges(root: Path, diff_subject: list[str]) -> dict[str, list[dict[str, int]]]:
    """Parse exact after-image ranges from the already selected comparison subject."""
    output = _git(
        root,
        [
            "-c",
            "core.quotePath=false",
            "diff",
            "--unified=0",
            "--no-color",
            "--no-ext-diff",
            "-M",
            "--diff-filter=ACMR",
            *diff_subject,
        ],
    )
    ranges: dict[str, list[dict[str, int]]] = {}
    current: str | None = None
    for line in output.splitlines():
        if line.startswith("+++ b/"):
            current = _safe_path(line[6:])
            continue
        if line == "+++ /dev/null":
            current = None
            continue
        if current is None or not line.startswith("@@"):
            continue
        match = re.match(r"@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@", line)
        if not match:
            raise ChangedPathError(f"cannot parse Git hunk header: {line}")
        count = int(match.group(2) or "1")
        if count == 0:
            continue
        start = max(int(match.group(1)), 1)
        ranges.setdefault(current, []).append({"start": start, "end": start + count - 1})
    return ranges


def _source(
    kind: str,
    path: str,
    reference: str | None = None,
    *,
    identity: str | None = None,
    file_type: str | None = None,
) -> dict[str, str]:
    """Describe bytes and bind them to one identity during plan resolution."""
    value = {"kind": kind, "path": path}
    if reference is not None:
        value["ref"] = reference
    if identity is not None:
        value["identity"] = identity
    if file_type is not None:
        value["file_type"] = file_type
    return value


def _file_type_from_git_mode(mode: str, object_name: str) -> str:
    """Classify the ordinary blob modes retained by a Git subject."""
    if mode in {"100644", "100755"}:
        return "regular"
    if mode == "120000":
        return "symlink"
    raise ChangedPathError(f"comparison source {object_name!r} is not a regular file or symlink")


def _tree_file_type(root: Path, reference: str, path: str) -> str:
    """Return one exact path's immutable file type from a Git tree."""
    output = _git_bytes(root, ["ls-tree", "-z", reference, "--", f":(literal){path}"])
    records = [value for value in output.split(b"\0") if value]
    if len(records) != 1 or b"\t" not in records[0]:
        raise ChangedPathError(f"comparison source {reference}:{path!s} is unavailable")
    metadata, raw_path = records[0].split(b"\t", 1)
    if os.fsdecode(raw_path) != path:
        raise ChangedPathError(f"comparison source {reference}:{path!s} is ambiguous")
    mode = metadata.split(b" ", 1)[0].decode("ascii", errors="strict")
    return _file_type_from_git_mode(mode, f"{reference}:{path}")


def _index_entry(root: Path, path: str) -> tuple[str, str]:
    """Return one staged blob identity and file type from the same index entry."""
    output = _git_bytes(
        root, ["ls-files", "--stage", "-z", "--", f":(literal){path}"]
    )
    records = [value for value in output.split(b"\0") if value]
    if len(records) != 1 or b"\t" not in records[0]:
        raise ChangedPathError(f"comparison source :{path!s} is unavailable")
    metadata, raw_path = records[0].split(b"\t", 1)
    if os.fsdecode(raw_path) != path:
        raise ChangedPathError(f"comparison source :{path!s} is ambiguous")
    fields = metadata.decode("ascii", errors="strict").split()
    if len(fields) != 3 or fields[2] != "0":
        raise ChangedPathError(f"comparison source :{path!s} has an unresolved index stage")
    mode, identity, _ = fields
    return identity, _file_type_from_git_mode(mode, f":{path}")


def _git_blob_identity(root: Path, object_name: str) -> str:
    """Resolve one Git-backed source to its immutable blob object ID."""
    identity = _git(root, ["rev-parse", "--verify", object_name]).strip()
    object_type = _git(root, ["cat-file", "-t", identity]).strip()
    if object_type != "blob":
        raise ChangedPathError(f"comparison source {object_name!r} is not a blob")
    return identity


def worktree_source(root: Path, path: str) -> tuple[bytes, str]:
    """Read bytes and type from one regular file or final symlink operation."""
    candidate = root / path
    try:
        resolved_root = root.resolve(strict=True)
        component = root
        for part in Path(path).parts[:-1]:
            component /= part
            if stat.S_ISLNK(component.lstat().st_mode):
                raise ChangedPathError(
                    f"changed worktree input cannot traverse a symlink: {path!r}"
                )
        metadata = candidate.lstat()
    except ValueError as error:
        raise ChangedPathError(
            f"changed worktree input escapes the repository root: {path!r}"
        ) from error
    except OSError as error:
        raise ChangedPathError(f"cannot capture worktree content for {path!r}") from error
    if stat.S_ISLNK(metadata.st_mode):
        try:
            return os.fsencode(os.readlink(candidate)), "symlink"
        except OSError as error:
            raise ChangedPathError(
                f"cannot capture worktree symlink payload for {path!r}"
            ) from error
    try:
        candidate.resolve(strict=True).relative_to(resolved_root)
    except ValueError as error:
        raise ChangedPathError(
            f"changed worktree input escapes the repository root: {path!r}"
        ) from error
    if not stat.S_ISREG(metadata.st_mode):
        raise ChangedPathError(
            f"changed worktree input must be a regular file or final symlink: {path!r}"
        )
    try:
        descriptor = os.open(candidate, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        with os.fdopen(descriptor, "rb") as handle:
            if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
                raise ChangedPathError(
                    f"changed worktree input must remain a regular file: {path!r}"
                )
            return handle.read(), "regular"
    except OSError as error:
        raise ChangedPathError(f"cannot capture worktree content for {path!r}") from error


def worktree_file_bytes(root: Path, path: str) -> bytes:
    """Read one regular file or Git-compatible final symlink payload safely."""
    return worktree_source(root, path)[0]


def _worktree_identity_and_type(root: Path, path: str) -> tuple[str, str]:
    """Capture one worktree after-image's byte identity and file type together."""
    content, file_type = worktree_source(root, path)
    return f"sha256:{hashlib.sha256(content).hexdigest()}", file_type


def _source_exists(root: Path, reference: str, path: str) -> bool:
    """Return whether a path exists in one Git tree without reading its bytes."""
    result = subprocess.run(
        ["git", "cat-file", "-e", f"{reference}:{path}"],
        cwd=root,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def _untracked_paths(root: Path) -> list[str]:
    """Return nonignored untracked paths as normalized repository-relative values."""
    output = _git_bytes(root, ["ls-files", "--others", "--exclude-standard", "-z"])
    return sorted(_safe_path(os.fsdecode(value)) for value in output.split(b"\0") if value)


def _record_sources(
    root: Path,
    record: dict[str, Any],
    *,
    base_ref: str,
    after_kind: str,
) -> dict[str, Any]:
    """Attach the exact before and after byte authorities to one status record."""
    status = record["status"]
    path = record["path"]
    previous_path = record.get("previous_path")
    before_path = previous_path or path
    before = None
    if status != "added":
        before_object = f"{base_ref}:{before_path}"
        before = _source(
            "git",
            before_path,
            base_ref,
            identity=_git_blob_identity(root, before_object),
            file_type=_tree_file_type(root, base_ref, before_path),
        )
    after = None
    if status != "deleted":
        if after_kind == "index":
            identity, file_type = _index_entry(root, path)
            after = _source(
                "index",
                path,
                identity=identity,
                file_type=file_type,
            )
        else:
            identity, file_type = _worktree_identity_and_type(root, path)
            after = _source(
                "worktree",
                path,
                identity=identity,
                file_type=file_type,
            )
    return {
        **record,
        "before": before,
        "after": after,
    }


def _comparison_subject(
    root: Path,
    *,
    staged: bool,
    selected_explicit: list[str],
    base_ref: str | None,
    packet_mode: str | None,
) -> tuple[str, list[str], str, str]:
    """Resolve the Git subject, packet mode, and after-image authority once."""
    if staged:
        return _verified_commit(root, "HEAD"), ["--cached"], packet_mode or "staged", "index"
    configured_base = base_ref or os.environ.get("GOVERNANCE_BASE_REF", "").strip()
    if selected_explicit and not configured_base:
        raise ChangedPathError("explicit changed paths require --base-ref or GOVERNANCE_BASE_REF")
    base = _base_commit(root, base_ref)
    diff_subject = [base]
    if selected_explicit:
        diff_subject.extend(["--", *selected_explicit])
    return base, diff_subject, packet_mode or (
        "explicit" if selected_explicit else "changed"
    ), "worktree"


def _supplement_current_paths(
    root: Path,
    *,
    base: str,
    selected_explicit: list[str],
    records: dict[str, dict[str, Any]],
) -> None:
    """Add untracked or explicitly selected paths absent from Git's tracked diff."""
    untracked = set(_untracked_paths(root))
    candidates = selected_explicit or sorted(untracked)
    for path in candidates:
        if path in records:
            continue
        try:
            current_mode = (root / path).lstat().st_mode
            current_exists = stat.S_ISREG(current_mode) or stat.S_ISLNK(current_mode)
        except OSError:
            current_exists = False
        existed_before = _source_exists(root, base, path)
        if current_exists and not existed_before:
            status = "added"
        elif selected_explicit and current_exists:
            status = "modified"
        elif selected_explicit and existed_before:
            status = "deleted"
        else:
            continue
        records[path] = {"status": status, "path": path, "previous_path": None}


def _resolved_records(
    root: Path,
    raw_records: list[dict[str, Any]],
    ranges: dict[str, list[dict[str, int]]],
    *,
    base: str,
    after_kind: str,
) -> list[dict[str, Any]]:
    """Attach byte sources and exact ranges in deterministic path order."""
    result: list[dict[str, Any]] = []
    for record in sorted(raw_records, key=lambda item: item["path"]):
        resolved = _record_sources(root, record, base_ref=base, after_kind=after_kind)
        resolved["changed_ranges"] = ranges.get(record["path"], [])
        result.append(resolved)
    return result


def _scope_snapshot(
    root: Path,
    *,
    diff_subject: list[str],
    base: str,
    staged: bool,
    selected_explicit: list[str],
) -> tuple[list[dict[str, Any]], dict[str, list[dict[str, int]]]]:
    """Read one status-and-range view of the current comparison subject."""
    status_output = _git_bytes(
        root,
        ["diff", "--name-status", "-z", "-M", "--diff-filter=ACDMRTUXB", *diff_subject],
    )
    records = _name_status_records(status_output)
    ranges = _diff_ranges(root, diff_subject)
    by_path = {record["path"]: record for record in records}
    if not staged:
        _supplement_current_paths(
            root,
            base=base,
            selected_explicit=selected_explicit,
            records=by_path,
        )
    return sorted(by_path.values(), key=lambda item: item["path"]), ranges


def resolve_change_scope(
    root: Path,
    *,
    staged: bool = False,
    all_scope: bool = False,
    explicit_paths: list[str] | None = None,
    base_ref: str | None = None,
    packet_mode: str | None = None,
) -> dict[str, Any]:
    """Resolve one immutable comparison packet without materializing content bytes."""
    if all_scope:
        records: list[dict[str, Any]] = []
        return {
            "kind": PACKET_KIND,
            "version": PACKET_VERSION,
            "scope": "all",
            "mode": "all",
            "base_ref": None,
            "records": records,
            # All mode reads the live checkout and is not one content-bound packet.
            "subject_digest": None,
        }

    selected_explicit = sorted({_safe_path(path) for path in explicit_paths or []})
    base, diff_subject, mode, after_kind = _comparison_subject(
        root,
        staged=staged,
        selected_explicit=selected_explicit,
        base_ref=base_ref,
        packet_mode=packet_mode,
    )

    records, ranges = _scope_snapshot(
        root,
        diff_subject=diff_subject,
        base=base,
        staged=staged,
        selected_explicit=selected_explicit,
    )
    resolved_records = _resolved_records(
        root, records, ranges, base=base, after_kind=after_kind
    )
    verified_records, verified_ranges = _scope_snapshot(
        root,
        diff_subject=diff_subject,
        base=base,
        staged=staged,
        selected_explicit=selected_explicit,
    )
    if records != verified_records or ranges != verified_ranges:
        raise ChangedPathError("comparison subject changed while resolving change scope")
    return {
        "kind": PACKET_KIND,
        "version": PACKET_VERSION,
        "scope": "changed",
        "mode": mode,
        "base_ref": base,
        "records": resolved_records,
        "subject_digest": subject_digest(resolved_records),
    }


def changed_path_records(root: Path, *, staged: bool) -> list[tuple[str, bool]]:
    """Project the resolved packet into the path-and-newness planning shape."""
    packet = resolve_change_scope(root, staged=staged)
    return [
        (record["path"], record["status"] in {"added", "renamed"})
        for record in packet["records"]
    ]


def changed_paths(root: Path, *, staged: bool) -> list[str]:
    """Return only the path projection used by validation planning."""
    return [path for path, _ in changed_path_records(root, staged=staged)]
