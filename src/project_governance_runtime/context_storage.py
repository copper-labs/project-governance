"""Private bounded context state, separate from validation telemetry and credentials."""

import json
from pathlib import Path

from .state_io import atomic_write_text, path_lock


def state_path(root, name):
    """Reject symbolic links before accessing private context state."""
    if Path(name).name != name:
        raise ValueError("Unsafe context state name")
    base = root / ".governance/context"
    for path in (root / ".governance", base, base / name, (base / name).with_suffix(Path(name).suffix + ".lock")):
        if path.is_symlink():
            raise ValueError("Context state must not use symbolic links")
    return base / name


def read(root, name):
    """Read one bounded private state object."""
    path = state_path(root, name)
    if not path.exists():
        return {}
    if not path.is_file() or path.stat().st_size > 1048576:
        raise ValueError("Context state is outside its bound")
    with path.open("rb") as handle:
        raw = handle.read(1048577)
    if len(raw) > 1048576:
        raise ValueError("Context state is outside its bound")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("Invalid context state")
    return value


def write(root, name, value):
    """Publish a bounded private receipt atomically."""
    path = state_path(root, name)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.parent.chmod(0o700)
    raw = json.dumps(value, sort_keys=True)
    if len(raw.encode()) > 1048576:
        raise ValueError("Context state is outside its bound")
    atomic_write_text(path, raw + "\n")
    path.chmod(0o600)


def observe(root, value):
    """Retain at most 128 content-free observations; failure never blocks work."""
    allowed = {"mode", "status", "reason", "duration_ms", "input_tokens", "output_tokens",
               "baseline_bytes", "selected_bytes", "candidate_bytes", "requests", "delivery",
               "packet_digest", "bytes", "role", "expanded_bytes", "proposed_candidate_bytes"}
    entry = {key: item for key, item in value.items() if key in allowed}
    try:
        path = state_path(root, "observations.json")
        with path_lock(path):
            current = read(root, path.name).get("records", [])
            write(root, path.name, {"schema_version": 1, "records": [*current[-127:], entry]})
    except (OSError, ValueError, TimeoutError, TypeError):
        pass
