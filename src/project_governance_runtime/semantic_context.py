"""Optional whole-file relevance selection; required context and validation stay deterministic."""

import hashlib
import math
import time

from .context_options import options
from . import context_storage as storage


def _preflight(root, router, task, settings, paths, request_allowance):
    """Validate readiness, task authorization and the complete candidate pool before reading."""
    from .jev import readiness
    mode = settings["mode"]
    if not settings["allow_task_text"]:
        return ("task-egress-not-authorized")
    if mode == "on" and not router.get("delivery", {}).get("enabled"):
        return ("delivery-not-enabled")
    ready = readiness(root, settings["model"])
    if ready["status"] != "ready":
        return (ready["reason"])
    if not paths:
        return ("no-candidates")
    if len(paths) > settings["max_candidates"] or (request_allowance is not None and len(paths) > request_allowance):
        return ("candidate-or-task-request-bound")
    if not set(paths) <= set(settings["allow_paths"]):
        return ("candidate-egress-not-authorized")
    if len(task.encode()) > 8000:
        return ("task-bound")
    return None


def _candidates(root, task, settings, paths, metadata):
    """Bound, decode and scan the entire pool before any sibling can leave the machine."""
    from .context import _file_bytes
    from .checker_scripts.secret_detectors import DETECTOR_PATTERNS
    snapshots = [_file_bytes(root, p, max_bytes=settings["max_candidate_bytes"]) for p in paths]
    if any(raw is None for raw in snapshots):
        raise ValueError("candidate-unavailable")
    texts = [raw.decode("utf-8") for raw in snapshots]
    metadata["candidate_bytes"] = sum(len(raw) for raw in snapshots)
    if metadata["candidate_bytes"] > settings["max_total_bytes"]:
        raise ValueError("candidate-byte-bound")
    # Reject the whole pool before any request can leave this process.
    import os
    token = os.environ.get("JEV_TOKEN", "").encode()
    if any((token and token in raw) or any(p.search(raw) for p in DETECTOR_PATTERNS.values())
           for raw in [task.encode(), *snapshots]):
        raise ValueError("egress-secret-detected")
    return snapshots, texts


def _assemble(root, settings, groups, budget, paths, snapshots, scores, baseline, omissions, baseline_groups, metadata):
    """Apply relevance only after all candidates and required sources pass identity checks."""
    from .context import _context_items
    mode = settings["mode"]
    if mode == "shadow":
        metadata["status"] = "shadow"
        metadata["expanded_bytes"] = metadata["candidate_bytes"]
        if settings['threshold'] is not None:
            metadata['proposed_candidate_bytes'] = sum(len(raw) for raw, score in zip(snapshots, scores) if score >= settings['threshold'])
        return (baseline, omissions, "baseline-preserved")
    selected = [i for i in sorted(range(len(paths)), key=lambda i: (-scores[i], i)) if scores[i] >= settings["threshold"]]
    if not selected:
        return (baseline, omissions, "abstained")
    groups["expansion"] = [paths[i] for i in selected]
    items, skipped, _ = _context_items(root, groups, budget)
    expected = {p: raw for p, raw in zip(paths, snapshots)}
    expected.update({item["source_path"]: item["content"] for item in baseline if item["group"] != "expansion"})
    if any(item["content"] != expected[item["source_path"]] for item in items):
        fresh, skipped, _ = _context_items(root, baseline_groups, budget)
        return (fresh, skipped, "source-changed")
    skipped += [{"path": path, "group": "expansion", "reason": "semantic-threshold", "required": False}
                for i, path in enumerate(paths) if i not in selected]
    metadata["status"] = "selected"
    return (items, skipped, "relevance-applied")


def select(root, router, task, route, baseline_groups, budget, baseline, omissions, request_allowance=None):
    """Score only authorized optional sources, preserving deterministic fallback and required text."""
    from .context import _context_items, _file_bytes, _groups, _SourceOutsideBudget
    from .jev import evaluate, readiness, request
    from .checker_scripts.secret_detectors import DETECTOR_PATTERNS

    settings = options(router)
    mode = settings["mode"]
    started = time.monotonic()
    metadata = {"mode": mode, "status": "fallback", "requests": 0,
                "baseline_bytes": sum(x["exact_bytes"] for x in baseline)}

    def finish(items, skipped, reason):
        metadata.update(reason=reason, selected_bytes=sum(x["exact_bytes"] for x in items),
                        duration_ms=round((time.monotonic() - started) * 1000))
        storage.observe(root, metadata)
        return items, skipped, metadata

    _, groups, _ = _groups(router, {"selected": {"route": route}}, True)
    paths = groups['expansion']
    reason = _preflight(root, router, task, settings, paths, request_allowance)
    if reason:
        if reason in {'credentials-unavailable', 'setup-required'}:
            metadata['status'] = 'inactive'
        return finish(baseline, omissions, reason)
    scored = False
    try:
        snapshots, texts = _candidates(root, task, settings, paths, metadata)
        outcome = evaluate([request(task, text, settings["model"]) for text in texts], settings["deadline_seconds"])
        metadata.update({k: outcome[k] for k in ("requests", "input_tokens", "output_tokens") if k in outcome})
        if outcome.get("status") != "scored":
            return finish(baseline, omissions, outcome.get("reason", "provider-unavailable"))
        scores = outcome.get("scores", [])
        if len(scores) != len(paths) or any(type(s) not in (int, float) or not math.isfinite(s) or not 0 <= s <= 1 for s in scores):
            return finish(baseline, omissions, "incomplete-batch")
        scored = True
        # No score may be applied to a different after-image, including required sources.
        if (any(_file_bytes(root, p, max_bytes=settings["max_candidate_bytes"]) != raw for p, raw in zip(paths, snapshots))
                or any(_file_bytes(root, item["source_path"], max_bytes=item["exact_bytes"]) != item["content"] for item in baseline)):
            fresh, skipped, _ = _context_items(root, baseline_groups, budget)
            return finish(fresh, skipped, "source-changed")
        metadata["candidate_ids"] = [hashlib.sha256(p.encode()).hexdigest()[:16] for p in paths]
        metadata["scores"] = scores
        items, skipped, reason = _assemble(root, settings, groups, budget, paths, snapshots, scores, baseline, omissions, baseline_groups, metadata)
        return finish(items, skipped, reason)
    except (_SourceOutsideBudget, OSError, UnicodeError, ValueError, TypeError):
        if scored:
            fresh, skipped, _ = _context_items(root, baseline_groups, budget)
            return finish(fresh, skipped, "source-changed")
        return finish(baseline, omissions, "candidate-or-response-unavailable")
