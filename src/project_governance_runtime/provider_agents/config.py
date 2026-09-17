"""Validate explicit provider bindings without a model catalog or role routing policy."""

from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil


class AgentError(ValueError):
    """A caller, native provider, or stored-state failure with an actionable explanation."""


TERMINAL = {"succeeded", "blocked", "failed", "cancelled", "timed_out"}
PROVIDERS = {"gemini": "agy", "claude": "claude", "codex": "codex"}


def duration(value, label="timeout", maximum=604800):
    """Parse a bounded caller deadline, keeping zero as explicitly disabled."""
    if isinstance(value, str):
        match = re.fullmatch(r"(\d+(?:\.\d+)?)(ms|s|m|h)?", value)
        if not match:
            raise AgentError(f"{label} must be seconds or a duration such as 30m")
        value = float(match[1]) * {None: 1, "ms": .001, "s": 1, "m": 60, "h": 3600}[match[2]]
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise AgentError(f"{label} must be a finite number")
    if not 0 <= value <= maximum:
        raise AgentError(f"{label} must be between 0 and {maximum}; zero disables it")
    return float(value)


def directory(value):
    """Resolve an existing absolute directory before granting workspace ownership."""
    if not isinstance(value, str) or not value:
        raise AgentError("workspace roots must be absolute existing directories")
    path = Path(value).expanduser()
    if not path.is_absolute() or not path.is_dir():
        raise AgentError(f"workspace root is not an absolute existing directory: {value}")
    return str(path.resolve())


def binding(provider, model=None, effort=None, executable=None, config=None):
    """Resolve explicit host choices without inventing a model or falling back."""
    if provider not in PROVIDERS:
        raise AgentError("provider must be gemini, claude, or codex")
    defaults = _binding_defaults(config, provider)
    model, effort = model or defaults.get("model"), effort or defaults.get("effort")
    for name, value in (("model", model), ("effort", effort)):
        if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}", value):
            raise AgentError(f"an explicit {name} is required; configure it or pass --{name}")
    _validate_effort(provider, model, effort)
    command = executable or defaults.get("executable") or PROVIDERS[provider]
    if not isinstance(command, str):
        raise AgentError("executable must be one path, not shell arguments")
    path = shutil.which(command)
    if not path:
        raise AgentError(f"{provider} executable is unavailable: {command}; install and authenticate it first")
    return {"provider": provider, "model": model, "effort": effort, "backend": str(Path(path).resolve())}


def _binding_defaults(config, provider):
    if not config:
        return {}
    path = Path(config).expanduser()
    if path.stat().st_size > 65536:
        raise AgentError("provider configuration exceeds 64 KiB")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or value.get("version") != 1 or not isinstance(value.get("providers"), dict):
        raise AgentError("configuration requires version: 1 and a providers object")
    defaults = value["providers"].get(provider, {})
    if not isinstance(defaults, dict) or set(defaults) - {"model", "effort", "executable"}:
        raise AgentError("provider binding accepts only model, effort, and executable")
    return defaults


def _validate_effort(provider, model, effort):
    if provider != "gemini":
        return
    suffix = re.search(r"-(low|medium|high)$", model)
    if effort not in {"low", "medium", "high"} or (suffix and suffix[1] != effort):
        raise AgentError("Gemini model suffix and low/medium/high effort must agree")


def code_digest():
    """Fingerprint support files so startup cannot mix runner revisions."""
    digest = hashlib.sha256()
    for path in sorted(Path(__file__).parent.glob("*.py")):
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()
