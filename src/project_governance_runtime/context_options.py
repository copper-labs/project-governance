"""Validate optional context controls locally, without credentials or provider imports."""

import math
from pathlib import PurePosixPath


MODEL = "jev-1.13.0"
DEFAULTS = dict(mode="off", model=MODEL, allow_paths=[], allow_task_text=False,
                max_candidates=12, max_candidate_bytes=16000, max_total_bytes=64000,
                deadline_seconds=4.0, threshold=None)


def _paths(paths):
    """Require a small list of explicit normalized repository paths."""
    if not isinstance(paths, list) or len(paths) > 128:
        raise ValueError("allow_paths must be a bounded list of exact relative paths")
    for path in paths:
        if (not isinstance(path, str) or not path or PurePosixPath(path).is_absolute()
                or ".." in PurePosixPath(path).parts or "\\" in path or any(c in path for c in "*?[]")
                or str(PurePosixPath(path)) != path):
            raise ValueError("allow_paths requires normalized exact repository-relative paths")


def _scoring_bounds(result):
    """Enforce finite numeric transport and relevance limits."""
    for key, ceiling in (("max_candidates", 32), ("max_candidate_bytes", 32000), ("max_total_bytes", 128000)):
        if type(result[key]) is not int or not 1 <= result[key] <= ceiling:
            raise ValueError(key + " is outside its supported bound")
    for key, low, high in (("deadline_seconds", 0.1, 8), ("threshold", 0, 1)):
        number = result[key]
        if key == "threshold" and number is None:
            continue
        if type(number) not in (int, float) or not math.isfinite(number) or not low <= number <= high:
            raise ValueError(key + " is outside its supported bound")


def options(router):
    """Validate project scoring opt-in and its hard limits."""
    value = router.get("semantic_selection", {})
    if not isinstance(value, dict) or set(value) - set(DEFAULTS):
        raise ValueError("context_router.semantic_selection has invalid or unknown fields")
    result = {**DEFAULTS, **value}
    if not isinstance(result["mode"], str) or result["mode"] not in {"off", "shadow", "on"} or result["model"] != MODEL:
        raise ValueError("semantic selection requires off/shadow/on and the supported pinned model")
    if type(result["allow_task_text"]) is not bool:
        raise ValueError("allow_task_text must be boolean")
    _paths(result["allow_paths"])
    _scoring_bounds(result)
    if result["mode"] == "on" and result["threshold"] is None:
        raise ValueError("on mode requires an explicitly evaluated threshold")
    return result


def delivery_options(router):
    """Validate bounded automatic packet submission settings."""
    value = router.get("delivery", {})
    defaults = dict(enabled=False, max_events=8, max_bytes=524288, max_jev_requests=48)
    if not isinstance(value, dict) or set(value) - set(defaults):
        raise ValueError("context_router.delivery has invalid or unknown fields")
    result = {**defaults, **value}
    if type(result["enabled"]) is not bool:
        raise ValueError("delivery.enabled must be boolean")
    for key, ceiling in (("max_events", 32), ("max_bytes", 2097152), ("max_jev_requests", 128)):
        if type(result[key]) is not int or not 1 <= result[key] <= ceiling:
            raise ValueError("delivery." + key + " is outside its supported bound")
    return result
