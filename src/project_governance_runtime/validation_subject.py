"""Resolve repository files from one live or immutable validation subject."""

from __future__ import annotations

import os
import re
import stat
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .checker_scripts.governance_changed_paths import load_change_packet
from .structured_documents import PATH_MAX_BYTES


COMMIT_ID = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")


class ValidationSubjectError(RuntimeError):
    """Report one unavailable, unsafe, or inconsistent subject file."""


def safe_subject_path(value: Any) -> str:
    """Return one bounded repository-relative POSIX path."""
    if not isinstance(value, str) or not value or "\0" in value:
        raise ValidationSubjectError("path must be a non-empty NUL-free string")
    if len(value.encode("utf-8")) > PATH_MAX_BYTES:
        raise ValidationSubjectError(f"path exceeds {PATH_MAX_BYTES} UTF-8 bytes")
    path = Path(value)
    if path.is_absolute() or ".." in path.parts:
        raise ValidationSubjectError(f"unsafe repository-relative path: {value!r}")
    normalized = path.as_posix()
    if normalized != value or normalized in {".", ""}:
        raise ValidationSubjectError(f"path must use normalized POSIX form: {value!r}")
    return normalized


@dataclass(frozen=True)
class _Entry:
    """Describe one exact subject member without reading its contents."""

    kind: str
    source: str


class ValidationSubject:
    """Read exact graph authorities and reference metadata from one subject."""

    def __init__(
        self,
        root: Path,
        *,
        live: bool,
        base_ref: str | None = None,
        records: list[dict[str, Any]] | None = None,
    ) -> None:
        self.root = root.resolve(strict=True)
        self.live = live
        self.base_ref = base_ref
        self._overlay: dict[str, _Entry | None] = {}
        self._tree_cache: dict[str, _Entry | None] = {}
        if live:
            if base_ref is not None or records:
                raise ValidationSubjectError("live subject cannot carry a packet overlay")
            return
        if not isinstance(base_ref, str) or COMMIT_ID.fullmatch(base_ref) is None:
            raise ValidationSubjectError("content-bound subject has an invalid base_ref")
        for record in records or []:
            self._add_record(record)

    @classmethod
    def from_runtime(cls, root: Path) -> "ValidationSubject":
        """Create the exact subject declared by the runtime change packet."""
        packet = load_change_packet()
        if packet is None:
            raise ValidationSubjectError("validator requires a runtime change packet")
        if packet["scope"] == "all":
            if packet["mode"] != "all" or packet.get("base_ref") is not None:
                raise ValidationSubjectError("all-mode packet identity is inconsistent")
            return cls(root, live=True)
        if packet["scope"] != "changed" or packet["mode"] not in {
            "staged",
            "changed",
            "explicit",
        }:
            raise ValidationSubjectError("content-bound packet identity is inconsistent")
        return cls(
            root,
            live=False,
            base_ref=packet.get("base_ref"),
            records=packet["records"],
        )

    @classmethod
    def live_checkout(cls, root: Path) -> "ValidationSubject":
        """Create the explicit checkout-wide view used by doctor and all mode."""
        return cls(root, live=True)

    def _add_record(self, record: dict[str, Any]) -> None:
        """Overlay one normalized change packet record onto the immutable base tree."""
        path = safe_subject_path(record.get("path"))
        previous = record.get("previous_path")
        if record["status"] == "renamed" and previous is not None:
            self._overlay[safe_subject_path(previous)] = None
        if record["status"] == "deleted":
            self._overlay[path] = None
            return
        file_type = record.get("after_file_type")
        source = record.get("after_path")
        if file_type not in {"regular", "symlink"} or not isinstance(source, str):
            raise ValidationSubjectError("packet after-image lacks file-type identity")
        self._overlay[path] = _Entry(file_type, source)

    def _live_entry(self, path: str) -> _Entry | None:
        """Inspect one checkout path without following any symlink component."""
        candidate = self.root
        for index, part in enumerate(Path(path).parts):
            candidate /= part
            try:
                mode = candidate.lstat().st_mode
            except FileNotFoundError:
                return None
            except OSError as error:
                raise ValidationSubjectError(f"cannot inspect subject path {path!r}") from error
            final = index == len(Path(path).parts) - 1
            if stat.S_ISLNK(mode):
                return _Entry("symlink", str(candidate)) if final else _Entry("unsafe", str(candidate))
            if final:
                return _Entry("regular" if stat.S_ISREG(mode) else "other", str(candidate))
            if not stat.S_ISDIR(mode):
                return None
        return None

    def _tree_entry(self, path: str) -> _Entry | None:
        """Inspect one exact member of the packet's immutable base Git tree."""
        if path in self._tree_cache:
            return self._tree_cache[path]
        literal = f":(literal){path}"
        result = subprocess.run(
            ["git", "ls-tree", "-z", str(self.base_ref), "--", literal],
            cwd=self.root,
            capture_output=True,
            check=False,
        )
        if result.returncode != 0:
            detail = result.stderr.decode("utf-8", errors="replace").strip()
            raise ValidationSubjectError(detail or "cannot inspect immutable base tree")
        records = [value for value in result.stdout.split(b"\0") if value]
        if not records:
            self._tree_cache[path] = None
            return None
        if len(records) != 1 or b"\t" not in records[0]:
            raise ValidationSubjectError(f"ambiguous immutable subject path {path!r}")
        metadata, raw_path = records[0].split(b"\t", 1)
        if os.fsdecode(raw_path) != path:
            raise ValidationSubjectError(f"immutable subject returned the wrong path for {path!r}")
        fields = metadata.decode("ascii", errors="strict").split()
        if len(fields) != 3:
            raise ValidationSubjectError(f"malformed immutable tree entry for {path!r}")
        mode, object_type, object_id = fields
        if object_type != "blob":
            entry = _Entry("other", object_id)
        elif mode in {"100644", "100755"}:
            entry = _Entry("regular", object_id)
        elif mode == "120000":
            entry = _Entry("symlink", object_id)
        else:
            entry = _Entry("other", object_id)
        self._tree_cache[path] = entry
        return entry

    def entry_kind(self, value: Any) -> str | None:
        """Return regular, symlink, unsafe, other, or missing for one subject path."""
        path = safe_subject_path(value)
        if self.live:
            entry = self._live_entry(path)
        elif path in self._overlay:
            entry = self._overlay[path]
        else:
            entry = self._tree_entry(path)
        return entry.kind if entry is not None else None

    def _bounded_regular_file(self, path: Path, limit: int) -> bytes:
        """Read no more than one byte past a local regular-file limit."""
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        with os.fdopen(descriptor, "rb") as handle:
            if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
                raise ValidationSubjectError("subject content changed file type")
            return handle.read(limit + 1)

    def _bounded_blob(self, object_id: str, limit: int) -> bytes:
        """Read no more than one byte past a Git blob limit."""
        process = subprocess.Popen(
            ["git", "cat-file", "blob", object_id],
            cwd=self.root,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        assert process.stdout is not None
        data = process.stdout.read(limit + 1)
        if len(data) > limit:
            process.kill()
        _, stderr = process.communicate()
        if process.returncode not in {0, -9}:
            detail = stderr.decode("utf-8", errors="replace").strip()
            raise ValidationSubjectError(detail or "cannot read immutable subject blob")
        return data

    def read_bytes(self, value: Any, *, limit: int) -> bytes:
        """Read one regular subject member with a caller-supplied byte bound."""
        path = safe_subject_path(value)
        if self.live:
            entry = self._live_entry(path)
        elif path in self._overlay:
            entry = self._overlay[path]
        else:
            entry = self._tree_entry(path)
        if entry is None:
            raise ValidationSubjectError(f"subject path is missing: {path}")
        if entry.kind != "regular":
            raise ValidationSubjectError(f"subject path is not a regular file: {path}")
        try:
            if self.live or path in self._overlay:
                return self._bounded_regular_file(Path(entry.source), limit)
            return self._bounded_blob(entry.source, limit)
        except OSError as error:
            raise ValidationSubjectError(f"cannot read subject path: {path}") from error
