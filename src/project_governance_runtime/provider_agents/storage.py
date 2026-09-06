"""Private durable job records and reconnectable events; no governance telemetry."""

from __future__ import annotations

from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import time
import uuid

from . import PROTOCOL_VERSION
from .config import AgentError


def atomic_json(path, value):
    """Replace private state without exposing a partially written JSON document."""
    fd, temporary = tempfile.mkstemp(prefix=".write-", dir=Path(path).parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def read_json(path, default=None):
    """Read bounded regular state files and refuse symlink indirection."""
    try:
        with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "r", encoding="utf-8") as handle:
            if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode) or os.fstat(handle.fileno()).st_size > 32000000:
                raise AgentError(f"invalid or oversized state file: {Path(path).name}")
            return json.load(handle)
    except FileNotFoundError:
        return default


def validate_record(value):
    """Refuse unknown protocol versions before state can influence ownership."""
    if not isinstance(value, dict) or type(value.get("protocol_version")) is not int or value["protocol_version"] != PROTOCOL_VERSION:
        raise AgentError("unsupported job state version; preserve state and use its matching runner")
    if ("access" in value or "allow_readers" in value) and (value.get("access") not in ("exclusive", "shared") or
            type(value.get("allow_readers", False)) is not bool or
            (value.get("allow_readers", False) and value["access"] != "exclusive")):
        raise AgentError("unsupported workspace access; preserve the job's ownership record")
    return value


class Redactor:
    """Remove recognizable credentials from public progress and result projections."""
    def __init__(self):
        self.values = sorted({v for k, v in os.environ.items()
                              if re.search(r"(?:TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL)$", k)
                              and len(v) >= 8}, key=len, reverse=True)

    def text(self, value):
        """Replace known secrets and common credential forms in text."""
        for secret in self.values:
            value = value.replace(secret, "[REDACTED]")
        value = re.sub(r"(?i)(Bearer\s+)[A-Za-z0-9._~+/-]+=*", r"\1[REDACTED]", value)
        # Tool evidence often contains JSON or Python repr rather than structured fields.
        pattern = (r"(?i)((?:api[_-]?key|access[_-]?token|password|secret|authorization)\b[\"']?\s*[=:]\s*)"
                   r'''("(?:\\.|[^"\\])*(?:"|$)|'(?:\\.|[^'\\])*(?:'|$)|\[REDACTED\]|[^\s,;&"'}\]]+)''')
        def mask(match):
            quote = match[2][0] if match[2][0] in "\"'" else ""
            return match[1] + quote + "[REDACTED]" + quote
        return re.sub(pattern, mask, value)

    def clean(self, value):
        """Redact credentials recursively while preserving the surrounding evidence."""
        if isinstance(value, str):
            return self.text(value)
        if isinstance(value, list):
            return [self.clean(v) for v in value]
        if isinstance(value, dict):
            return {k: "[REDACTED]" if re.fullmatch(r"(?i)(api[_-]?key|access[_-]?token|password|secret|authorization)", k)
                    else self.clean(v) for k, v in value.items()}
        return value


class Store:
    """Keep private job records outside the replaceable governance installation."""
    def __init__(self, root=None):
        self.root = Path(root or os.environ.get("HARNESS_AGENT_STATE") or
                         Path.home() / ".local/share/harness-agents").expanduser().resolve()
        self.jobs = self.root / "jobs"
        if self.jobs.is_symlink():
            raise AgentError("job storage must not be a symlink")
        self.jobs.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.root.chmod(0o700)
        self.jobs.chmod(0o700)

    @contextmanager
    def lock(self):
        """Serialize registry decisions across callers and detached workers."""
        fd = os.open(self.root / "registry.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            yield
        finally:
            os.close(fd)

    def job(self, job_id):
        """Resolve one exact job ID without accepting traversal or symlinked records."""
        try:
            canonical = str(uuid.UUID(job_id))
        except (ValueError, TypeError, AttributeError) as error:
            raise AgentError("job ID must be a UUID") from error
        path = self.jobs / canonical
        if not path.is_dir() or path.is_symlink():
            raise AgentError(f"unknown job: {canonical}")
        validate_record(read_json(path / "status.json"))
        return path

    def records(self):
        """Enumerate jobs while refusing unsupported or unreadable ownership state."""
        for path in self.jobs.iterdir():
            if path.is_dir() and not path.is_symlink():
                value = read_json(path / "status.json")
                # Corrupt or newer records cannot silently relinquish workspace ownership.
                yield path, validate_record(value)

    def create(self, request):
        """Publish a queued job and original request before starting a worker."""
        job_id = str(uuid.uuid4())
        path = self.jobs / job_id
        path.mkdir(mode=0o700)
        atomic_json(path / "request.json", request)
        atomic_json(path / "status.json", {
            "protocol_version": PROTOCOL_VERSION, "job_id": job_id, "state": "queued",
            "created_at": time.time(), "updated_at": time.time(), "heartbeat_at": None,
            "stage": "Waiting for workspace ownership", "provider": request["provider"],
            "model": request["model"], "workspace": request["workspace"],
            "conversation_id": request.get("conversation_id"), "last_event": 0,
        })
        return job_id, path


class Events:
    """Append public progress with stable sequence numbers and credential redaction."""
    def __init__(self, path, provider):
        self.path, self.provider = path, provider
        self.redactor, self.sequence = Redactor(), 0

    def append(self, kind, **data):
        """Publish one JSON event for reconnecting readers."""
        self.sequence += 1
        record = self.redactor.clean(dict(sequence=self.sequence, timestamp=time.time(),
                                           provider=self.provider, type=kind, **data))
        fd = os.open(self.path, os.O_CREAT | os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        return record


def events_since(path, after=0, limit=100, max_bytes=32000):
    """Return complete bounded records after a previously issued byte cursor."""
    if isinstance(after, bool) or not isinstance(after, int) or after < 0:
        raise AgentError("after must be a nonnegative byte cursor")
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 500:
        raise AgentError("limit must be between 1 and 500")
    try:
        with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as handle:
            _seek_cursor(handle, after)
            return _read_events(handle, after, limit, max_bytes)
    except FileNotFoundError:
        if after:
            raise AgentError("cursor is beyond the event log") from None
        return {"events": [], "cursor": 0, "has_more": False}


def _seek_cursor(handle, after):
    if after > os.fstat(handle.fileno()).st_size:
        raise AgentError("cursor is beyond the event log")
    if after:
        handle.seek(after - 1)
        if handle.read(1) != b"\n":
            raise AgentError("cursor must come from an earlier events response")
    handle.seek(after)


def _read_events(handle, after, limit, max_bytes):
    records, cursor, total, more = [], after, 0, False
    while len(records) < limit:
        line = handle.readline(1000001)
        if len(line) > 1000000:
            raise AgentError("event record exceeds its size limit")
        if not line or not line.endswith(b"\n"):
            break
        if records and total + len(line) > max_bytes:
            more = True
            break
        record = json.loads(line)
        if len(line) > max_bytes:
            record = {"sequence": record.get("sequence"), "timestamp": record.get("timestamp"),
                      "type": record.get("type"), "provider": record.get("provider"),
                      "payload_truncated": True, "message": str(record.get("message", ""))[:4000]}
        records.append(record)
        cursor, total = handle.tell(), total + len(line)
    if len(records) == limit:
        line = handle.readline(1000001)
        more = bool(line and line.endswith(b"\n"))
    return {"events": records, "cursor": cursor, "has_more": more}
