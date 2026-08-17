#!/usr/bin/env python3
"""Reject workstation paths and private target identifiers before source publication."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, BinaryIO


ROOT = Path(__file__).resolve().parents[1]
WORKSTATION_PATTERNS = (
    re.compile(r"/Users/[A-Za-z0-9._-]+/"),
    re.compile(r"/home/[A-Za-z0-9._-]+/"),
    re.compile(r"[A-Za-z]:\\+Users\\+[^\\/\r\n]+\\+", re.IGNORECASE),
)
BLOB_CHUNK_BYTES = 64 * 1024
BLOB_OVERLAP_BYTES = 4 * 1024


def git_run(args: list[str], *, text: bool = False) -> subprocess.CompletedProcess[Any]:
    """Run one read-only Git command without honoring replacement objects."""
    environment = {**os.environ, "GIT_NO_REPLACE_OBJECTS": "1"}
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=text,
        capture_output=True,
        check=False,
        env=environment,
    )


def is_git_checkout() -> bool:
    """Return whether full index and history evidence is available."""
    result = git_run(["rev-parse", "--is-inside-work-tree"], text=True)
    return result.returncode == 0 and result.stdout.strip() == "true"


def operator_state_dir() -> Path:
    """Return the operator-owned state directory kept outside this checkout."""
    configured = os.environ.get("GOVERNANCE_OPERATOR_STATE_DIR", "").strip()
    return Path(configured).expanduser().resolve() if configured else (
        Path.home() / ".local/share/project-governance"
    ).resolve()


def scan_paths() -> list[str]:
    """Return tracked and nonignored untracked publication candidates."""
    result = git_run(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
    if result.returncode == 0:
        return sorted({os.fsdecode(raw) for raw in result.stdout.split(b"\0") if raw})
    return sorted(
        path.relative_to(ROOT).as_posix()
        for path in ROOT.rglob("*")
        if path.is_file() and not path.is_symlink() and ".git" not in path.relative_to(ROOT).parts
    )


def read_terms(path: Path, *, optional: bool) -> list[str]:
    """Read private terms without making the source repository own their inventory."""
    if optional and not path.is_file():
        return []
    return [
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def configured_terms(explicit: list[str], denylist: str | None) -> list[str]:
    """Combine explicit terms with the external default denylist."""
    terms = [value.strip() for value in explicit if value.strip()]
    path = Path(denylist).expanduser().resolve() if denylist else (
        operator_state_dir() / "private-identifiers.txt"
    )
    terms.extend(read_terms(path, optional=denylist is None))
    unique: dict[str, str] = {}
    for term in terms:
        unique.setdefault(term.casefold(), term)
    return list(unique.values())


def text_findings(text: str, path: str, location: str, terms: list[str]) -> list[dict[str, str]]:
    """Return workstation-path and private-identifier findings for one text value."""
    findings: list[dict[str, str]] = []
    if any(pattern.search(text) for pattern in WORKSTATION_PATTERNS):
        findings.append({"rule_id": "publication.workstation-path", "path": path, "location": location})
    if any(term.casefold() in text.casefold() for term in terms):
        findings.append({"rule_id": "publication.private-identifier", "path": path, "location": location})
    return findings


def private_identifier_findings(
    text: str,
    path: str,
    location: str,
    terms: list[str],
) -> list[dict[str, str]]:
    """Return only configured-identifier findings for local Git metadata."""
    if any(term.casefold() in text.casefold() for term in terms):
        return [{"rule_id": "publication.private-identifier", "path": path, "location": location}]
    return []


def publication_file_findings(terms: list[str]) -> list[dict[str, str]]:
    """Scan publishable paths and UTF-8 file content."""
    findings: list[dict[str, str]] = []
    for relative in scan_paths():
        path = ROOT / relative
        findings.extend(text_findings(relative, relative, "path", terms))
        if path.is_symlink():
            target = os.readlink(path)
            findings.extend(text_findings(target, relative, "symlink-target", terms))
            continue
        if not path.is_file():
            continue
        try:
            with path.open("rb") as stream:
                findings.extend(stream_findings(stream, relative, "content", terms))
        except OSError:
            continue
    return findings


def index_entries() -> list[tuple[str, str]]:
    """Return blob ids and paths from every stage of the current index."""
    result = git_run(["ls-files", "--stage", "-z"])
    if result.returncode != 0:
        raise RuntimeError(f"git ls-files --stage failed with exit code {result.returncode}")
    entries: list[tuple[str, str]] = []
    for raw in result.stdout.split(b"\0"):
        if not raw:
            continue
        try:
            metadata, raw_path = raw.split(b"\t", 1)
            mode, object_id, _ = metadata.decode("ascii").split(" ", 2)
        except (UnicodeDecodeError, ValueError) as exc:
            raise RuntimeError("git ls-files --stage returned malformed data") from exc
        if mode != "160000":
            entries.append((object_id, raw_path.decode("utf-8", errors="replace")))
    return entries


def index_findings(terms: list[str]) -> list[dict[str, str]]:
    """Scan staged paths and blob bytes independently from worktree files."""
    findings: list[dict[str, str]] = []
    for blob_id, path in index_entries():
        findings.extend(text_findings(path, path, "git-index-path", terms))
        findings.extend(stream_blob_findings(blob_id, path, "git-index-blob-content", terms))
    return findings


def git_lines(args: list[str]) -> list[str]:
    """Return lines from one read-only Git query and fail closed on query errors."""
    result = git_run(args, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed with exit code {result.returncode}")
    return result.stdout.splitlines()


def git_object_type(object_id: str) -> str:
    """Return the Git type for one object id and fail closed on lookup errors."""
    lines = git_lines(["cat-file", "-t", object_id])
    if len(lines) != 1:
        raise RuntimeError(f"git cat-file -t {object_id} returned an unexpected result")
    return lines[0]


def git_object_bytes(object_type: str, object_id: str) -> bytes:
    """Return raw Git object content and fail closed on lookup errors."""
    result = git_run(["cat-file", object_type, object_id])
    if result.returncode != 0:
        raise RuntimeError(f"git cat-file {object_type} {object_id} failed with exit code {result.returncode}")
    return result.stdout


def stream_findings(
    stream: BinaryIO,
    path: str,
    location: str,
    terms: list[str],
) -> list[dict[str, str]]:
    """Scan one byte stream with bounded overlap instead of buffering it."""
    encoded_terms = [term.encode("utf-8") for term in terms]
    overlap_size = max(
        BLOB_OVERLAP_BYTES,
        max((len(term) - 1 for term in encoded_terms), default=0),
    )
    matched_rules: set[str] = set()
    overlap = b""
    while chunk := stream.read(BLOB_CHUNK_BYTES):
        window = overlap + chunk
        text = window.decode("utf-8", errors="replace")
        if any(pattern.search(text) for pattern in WORKSTATION_PATTERNS):
            matched_rules.add("publication.workstation-path")
        folded = window.lower()
        if any(term.lower() in folded for term in encoded_terms) or any(
            term.casefold() in text.casefold() for term in terms
        ):
            matched_rules.add("publication.private-identifier")
        overlap = window[-overlap_size:]
    return [
        {"rule_id": rule_id, "path": path, "location": location}
        for rule_id in sorted(matched_rules)
    ]


def stream_blob_findings(
    object_id: str,
    path: str,
    location: str,
    terms: list[str],
) -> list[dict[str, str]]:
    """Scan one Git blob through the shared bounded byte-stream matcher."""
    environment = {**os.environ, "GIT_NO_REPLACE_OBJECTS": "1"}
    process = subprocess.Popen(
        ["git", "cat-file", "blob", object_id],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=environment,
    )
    if process.stdout is None or process.stderr is None:
        process.kill()
        raise RuntimeError(f"git cat-file blob {object_id} did not expose output streams")
    findings = stream_findings(process.stdout, path, location, terms)
    stderr = process.stderr.read()
    returncode = process.wait()
    if returncode != 0:
        detail = stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"git cat-file blob {object_id} failed with exit code {returncode}: {detail}")
    return findings


def ref_records() -> list[tuple[str, str, str]]:
    """Return every active ref plus HEAD with direct object ids and types."""
    records: list[tuple[str, str, str]] = []
    for line in git_lines(["for-each-ref", "--format=%(refname)%09%(objectname)%09%(objecttype)"]):
        fields = line.split("\t")
        if len(fields) != 3 or not all(fields):
            raise RuntimeError("git for-each-ref returned malformed ref metadata")
        records.append((fields[0], fields[1], fields[2]))
    head_result = git_run(["rev-parse", "--verify", "--quiet", "HEAD"], text=True)
    if head_result.returncode == 0:
        head = head_result.stdout.strip()
        if not head:
            raise RuntimeError("git rev-parse --verify HEAD returned an empty object id")
        records.append(("HEAD", head, git_object_type(head)))
    else:
        symbolic = git_run(["symbolic-ref", "--quiet", "HEAD"], text=True)
        if symbolic.returncode != 0:
            raise RuntimeError("HEAD is neither a valid object nor an unborn symbolic branch")
    return records


def peel_tag_chain(
    ref: str,
    object_id: str,
    object_type: str,
) -> tuple[list[tuple[str, bytes, bytes]], str, str]:
    """Return tag headers/messages and the final object addressed by one ref."""
    tags: list[tuple[str, bytes, bytes]] = []
    seen: set[str] = set()
    while object_type == "tag":
        if object_id in seen:
            raise RuntimeError(f"annotated tag cycle detected at {ref}")
        seen.add(object_id)
        raw = git_object_bytes("tag", object_id)
        header, separator, message = raw.partition(b"\n\n")
        if not separator:
            raise RuntimeError(f"annotated tag {object_id} at {ref} has no message boundary")
        metadata: dict[bytes, bytes] = {}
        for line in header.splitlines():
            key, space, value = line.partition(b" ")
            if space and key in {b"object", b"type"}:
                metadata[key] = value
        try:
            target_id = metadata[b"object"].decode("ascii")
            declared_type = metadata[b"type"].decode("ascii")
        except (KeyError, UnicodeDecodeError) as exc:
            raise RuntimeError(f"annotated tag {object_id} at {ref} has malformed metadata") from exc
        actual_type = git_object_type(target_id)
        if declared_type != actual_type:
            raise RuntimeError(
                f"annotated tag {object_id} at {ref} declares {declared_type}, got {actual_type}"
            )
        tags.append((object_id, header, message))
        object_id, object_type = target_id, actual_type
    return tags, object_id, object_type


def tree_entries(object_id: str) -> list[tuple[str, str, str]]:
    """Return leaf types, object ids, and paths reachable from a commit or tree."""
    result = git_run(["ls-tree", "-r", "-z", object_id])
    if result.returncode != 0:
        raise RuntimeError(f"git ls-tree -r {object_id} failed with exit code {result.returncode}")
    entries: list[tuple[str, str, str]] = []
    for raw in result.stdout.split(b"\0"):
        if not raw:
            continue
        try:
            metadata, raw_path = raw.split(b"\t", 1)
            _, object_type, blob_id = metadata.decode("ascii").split(" ", 2)
        except (UnicodeDecodeError, ValueError) as exc:
            raise RuntimeError(f"git ls-tree returned malformed data for {object_id}") from exc
        entries.append((object_type, blob_id, raw_path.decode("utf-8", errors="replace")))
    return entries


def reachable_roots(
    refs: list[tuple[str, str, str]],
) -> tuple[dict[str, tuple[bytes, bytes]], set[str], set[str], set[tuple[str, str]]]:
    """Classify the objects and tag records reached through active roots."""
    commits: set[str] = set()
    trees: set[str] = set()
    blobs: set[tuple[str, str]] = set()
    tags: dict[str, tuple[bytes, bytes]] = {}
    for ref, direct_id, direct_type in refs:
        tag_chain, object_id, object_type = peel_tag_chain(ref, direct_id, direct_type)
        for tag_id, header, message in tag_chain:
            tags.setdefault(tag_id, (header, message))
        if object_type == "commit":
            commits.update(git_lines(["rev-list", object_id]))
        elif object_type == "tree":
            trees.add(object_id)
        elif object_type == "blob":
            blobs.add((object_id, ref))
        else:
            raise RuntimeError(f"unsupported Git ref object type {object_type} at {ref}")
    return tags, commits, trees, blobs


def tag_findings(
    tags: dict[str, tuple[bytes, bytes]],
    terms: list[str],
) -> list[dict[str, str]]:
    """Scan annotated-tag headers and raw messages, including nested tags."""
    findings: list[dict[str, str]] = []

    for tag_id, (header, message) in sorted(tags.items()):
        findings.extend(text_findings(
            header.decode("utf-8", errors="replace"),
            tag_id,
            "git-tag-header",
            terms,
        ))
        findings.extend(text_findings(
            message.decode("utf-8", errors="replace"),
            tag_id,
            "git-tag-message",
            terms,
        ))
    return findings


def tree_object_findings(
    object_ids: set[str],
    terms: list[str],
) -> tuple[list[dict[str, str]], set[tuple[str, str]]]:
    """Scan historical tree paths and return the text-blob candidates."""
    findings: list[dict[str, str]] = []
    blobs: set[tuple[str, str]] = set()
    for object_id in sorted(object_ids):
        for object_type, blob_id, path in tree_entries(object_id):
            findings.extend(text_findings(path, path, "git-object-path", terms))
            if object_type == "blob":
                blobs.add((blob_id, path))
    return findings, blobs


def commit_message_object_findings(
    commits: set[str],
    terms: list[str],
) -> list[dict[str, str]]:
    """Scan raw commit messages without dropping valid terms near invalid bytes."""
    findings: list[dict[str, str]] = []

    for commit_id in sorted(commits):
        raw = git_object_bytes("commit", commit_id)
        message = raw.split(b"\n\n", 1)[1] if b"\n\n" in raw else b""
        text = message.decode("utf-8", errors="replace")
        findings.extend(text_findings(text, commit_id, "git-commit-message", terms))
    return findings


def blob_object_findings(
    blobs: set[tuple[str, str]],
    terms: list[str],
) -> list[dict[str, str]]:
    """Scan UTF-8 blob objects reached from refs and their historical trees."""
    findings: list[dict[str, str]] = []
    for blob_id, path in sorted(blobs):
        findings.extend(stream_blob_findings(blob_id, path, "git-blob-content", terms))
    return findings


def reachable_git_object_findings(
    refs: list[tuple[str, str, str]],
    terms: list[str],
) -> list[dict[str, str]]:
    """Scan paths, text blobs, commits, and tags reachable through active roots."""
    tags, commits, trees, direct_blobs = reachable_roots(refs)
    commit_tree_findings, commit_blobs = tree_object_findings(commits, terms)
    tree_findings, tree_blobs = tree_object_findings(trees, terms)
    return [
        *tag_findings(tags, terms),
        *commit_tree_findings,
        *tree_findings,
        *commit_message_object_findings(commits, terms),
        *blob_object_findings(direct_blobs | commit_blobs | tree_blobs, terms),
    ]


def git_namespace_findings(terms: list[str]) -> list[dict[str, str]]:
    """Scan every active ref, its reachable content, and worktree metadata."""
    findings: list[dict[str, str]] = []
    refs = ref_records()
    for ref, _, _ in refs:
        findings.extend(private_identifier_findings(ref, ref, "git-ref", terms))
    worktree_roots: list[tuple[str, str, str]] = []
    for line in git_lines(["worktree", "list", "--porcelain"]):
        if line.startswith("worktree "):
            value = line.removeprefix("worktree ")
            findings.extend(private_identifier_findings(value, value, "worktree-path", terms))
        elif line.startswith("HEAD "):
            object_id = line.removeprefix("HEAD ")
            if object_id.strip("0"):
                worktree_roots.append((f"worktree-HEAD:{object_id}", object_id, git_object_type(object_id)))
        elif line.startswith("branch "):
            value = line.removeprefix("branch ")
            findings.extend(private_identifier_findings(value, value, "worktree-branch", terms))
    findings.extend(reachable_git_object_findings([*refs, *worktree_roots], terms))
    return findings


def commit_message_findings(path: str | None, terms: list[str]) -> list[dict[str, str]]:
    """Scan a proposed source commit message when invoked from the commit-msg hook."""
    if not path:
        return []
    message_path = Path(path)
    text = message_path.read_text(encoding="utf-8")
    return text_findings(text, "COMMIT_EDITMSG", "commit-message", terms)


def deduplicate(findings: list[dict[str, str]]) -> list[dict[str, str]]:
    """Keep the output stable when a checked-out branch appears in two Git surfaces."""
    return [dict(values) for values in sorted({tuple(sorted(item.items())) for item in findings})]


def main() -> int:
    """Scan the source tree and all active Git refs; private names stay external."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deny-term", action="append", default=[])
    parser.add_argument("--denylist", help="External file containing one private term per line.")
    parser.add_argument("--commit-message-file", help="Commit message file supplied by commit-msg.")
    parser.add_argument(
        "--scope",
        choices=("worktree", "full"),
        default="full",
        help="Scan current publishable content only, or include every active Git history root.",
    )
    args = parser.parse_args()
    try:
        terms = configured_terms(args.deny_term, args.denylist)
        git_available = is_git_checkout()
        if args.scope == "full" and not git_available:
            raise RuntimeError(
                "full publication validation requires a Git checkout; use --scope worktree for an unpacked source archive"
            )
        findings = [*publication_file_findings(terms)]
        if git_available:
            findings.extend(index_findings(terms))
        if args.scope == "full":
            findings.extend(git_namespace_findings(terms))
        findings.extend(commit_message_findings(args.commit_message_file, terms))
        findings = deduplicate(findings)
        output = {
            "version": 1,
            "kind": "governance-publication-clean-check",
            "status": "passed" if not findings else "failed",
            "scope": args.scope,
            "private_identifier_scan": "configured" if terms else "inactive-no-terms",
            "private_identifier_term_count": len(terms),
            "finding_count": len(findings),
            "findings": findings,
        }
        print(json.dumps(output, indent=2, sort_keys=True))
        return 0 if not findings else 1
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"check-publication-clean failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
