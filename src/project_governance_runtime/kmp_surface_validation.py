"""Validate one adopter-owned KMP cross-surface graph without executing proof."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .kmp_surface_authorities import GRAPH_PATH, authority_inputs
from .kmp_surface_composition import validate_area
from .validation_subject import (
    ValidationSubject,
    ValidationSubjectError,
    safe_subject_path,
)


STANDARD_PACK_ID = "kmp-surface-validation"
STRUCTURE_RULE = "kmp-surface.structure-invalid"
REFERENCE_RULE = "kmp-surface.reference-invalid"
IMPLEMENTATION_RULE = "kmp-surface.implementation-gap"
PROOF_RULE = "kmp-surface.proof-gap"
FINDING_LIMIT = 500
STABLE_ID = re.compile(r"^[a-z0-9][a-z0-9._-]*$")

class _FindingLimitReached(RuntimeError):
    pass

def _finding(
    rule_id: str,
    message: str,
    *,
    area_id: str | None = None,
    target_id: str | None = None,
    path: str | None = None,
) -> dict[str, str]:
    """Create one normalized blocking finding with only applicable coordinates."""
    result = {"severity": "blocking", "rule_id": rule_id, "message": message}
    for key, value in (("area_id", area_id), ("target_id", target_id), ("path", path)):
        if value:
            result[key] = value
    return result

class _Validator:
    """Apply the exact V1 document and route-composition contract."""

    implementation_rule = IMPLEMENTATION_RULE
    proof_rule = PROOF_RULE
    reference_rule = REFERENCE_RULE
    def __init__(self, subject: ValidationSubject, *, include_gaps: bool) -> None:
        self.subject = subject
        self.include_gaps = include_gaps
        self.findings: list[dict[str, str]] = []
        self.truncated = False

    def add(
        self,
        rule_id: str,
        message: str,
        *,
        area_id: str | None = None,
        target_id: str | None = None,
        path: str | None = None,
    ) -> None:
        """Retain one finding for deterministic sorting at the result boundary."""
        if len(self.findings) >= FINDING_LIMIT:
            self.truncated = True
            raise _FindingLimitReached
        self.findings.append(
            _finding(
                rule_id,
                message,
                area_id=area_id,
                target_id=target_id,
                path=path,
            )
        )

    @staticmethod
    def duplicates(values: list[Any]) -> list[Any]:
        """Return repeated hashable values in deterministic linear time."""
        seen: set[Any] = set()
        repeated: set[Any] = set()
        for value in values:
            if value in seen:
                repeated.add(value)
            else:
                seen.add(value)
        return sorted(repeated)

    def structure(
        self,
        message: str,
        *,
        area_id: str | None = None,
        target_id: str | None = None,
        path: str | None = None,
    ) -> None:
        """Record one schema, identity, composition, or safety-bound failure."""
        self.add(STRUCTURE_RULE, message, area_id=area_id, target_id=target_id, path=path)
    def mapping(
        self,
        value: Any,
        label: str,
        *,
        allowed: set[str],
        required: set[str] = frozenset(),
        area_id: str | None = None,
        target_id: str | None = None,
    ) -> dict[str, Any] | None:
        """Require one exact mapping and report missing or unknown fields."""
        if not isinstance(value, dict):
            self.structure(f"{label} must be a mapping", area_id=area_id, target_id=target_id)
            return None
        keys = {key for key in value if isinstance(key, str)}
        non_string = [repr(key) for key in value if not isinstance(key, str)]
        for key in sorted(non_string):
            self.structure(
                f"{label} has a non-string field {key}",
                area_id=area_id,
                target_id=target_id,
            )
        for key in sorted(keys - allowed):
            self.structure(
                f"{label} has unknown field {key}",
                area_id=area_id,
                target_id=target_id,
            )
        for key in sorted(required - keys):
            self.structure(
                f"{label}.{key} is required",
                area_id=area_id,
                target_id=target_id,
            )
        return value

    def text(
        self,
        value: Any,
        label: str,
        *,
        area_id: str | None = None,
        target_id: str | None = None,
        stable_id: bool = False,
    ) -> str | None:
        """Require one non-empty string and optionally one stable lowercase ID."""
        if not isinstance(value, str) or not value.strip() or value != value.strip():
            self.structure(
                f"{label} must be a non-empty string without surrounding whitespace",
                area_id=area_id,
                target_id=target_id,
            )
            return None
        if stable_id and STABLE_ID.fullmatch(value) is None:
            self.structure(
                f"{label} must be a stable lowercase ID",
                area_id=area_id,
                target_id=target_id,
            )
            return None
        return value

    def string_list(
        self,
        value: Any,
        label: str,
        *,
        area_id: str | None = None,
        target_id: str | None = None,
        stable_ids: bool = False,
    ) -> list[str]:
        """Require a non-empty unique string list."""
        if not isinstance(value, list) or not value:
            self.structure(f"{label} must be a non-empty list", area_id=area_id, target_id=target_id)
            return []
        result: list[str] = []
        for index, item in enumerate(value):
            parsed = self.text(
                item,
                f"{label}[{index}]",
                area_id=area_id,
                target_id=target_id,
                stable_id=stable_ids,
            )
            if parsed is not None:
                result.append(parsed)
        for item in self.duplicates(result):
            self.structure(
                f"{label} contains duplicate value {item}",
                area_id=area_id,
                target_id=target_id,
            )
        return list(dict.fromkeys(result))

    def reference(
        self,
        value: Any,
        label: str,
        *,
        area_id: str | None = None,
        target_id: str | None = None,
    ) -> str | None:
        """Require one safe regular file in the current validation subject."""
        if not isinstance(value, str):
            self.structure(f"{label} must be a path string", area_id=area_id, target_id=target_id)
            return None
        try:
            path = safe_subject_path(value)
            kind = self.subject.entry_kind(path)
        except ValidationSubjectError as error:
            self.add(
                REFERENCE_RULE,
                f"{label}: {error}",
                area_id=area_id,
                target_id=target_id,
                path=value,
            )
            return None
        if kind != "regular":
            state = "missing" if kind is None else f"not a regular file ({kind})"
            self.add(
                REFERENCE_RULE,
                f"{label} is {state}",
                area_id=area_id,
                target_id=target_id,
                path=path,
            )
            return None
        return path

    def component(
        self,
        value: Any,
        label: str,
        *,
        area_id: str,
        target_id: str | None = None,
    ) -> dict[str, Any]:
        """Parse checkpoints and proofs while enforcing component-local uniqueness."""
        mapping = self.mapping(
            value,
            label,
            allowed={"checkpoints", "proofs"},
            area_id=area_id,
            target_id=target_id,
        )
        if mapping is None:
            return {"checkpoints": [], "proofs": []}
        checkpoints: list[tuple[str, str]] = []
        raw_checkpoints = mapping.get("checkpoints", [])
        if not isinstance(raw_checkpoints, list):
            self.structure(
                f"{label}.checkpoints must be a list", area_id=area_id, target_id=target_id
            )
        else:
            for index, raw in enumerate(raw_checkpoints):
                item_label = f"{label}.checkpoints[{index}]"
                item = self.mapping(
                    raw,
                    item_label,
                    allowed={"role", "path"},
                    required={"role", "path"},
                    area_id=area_id,
                    target_id=target_id,
                )
                if item is None:
                    continue
                role = self.text(
                    item.get("role"), f"{item_label}.role", area_id=area_id, target_id=target_id
                )
                path = self.reference(
                    item.get("path"), f"{item_label}.path", area_id=area_id, target_id=target_id
                )
                if role is not None and path is not None:
                    checkpoints.append((role, path))
        for duplicate in self.duplicates(checkpoints):
            self.structure(
                f"{label} contains duplicate checkpoint {duplicate[0]} at {duplicate[1]}",
                area_id=area_id,
                target_id=target_id,
                path=duplicate[1],
            )

        proofs: list[tuple[str, set[str]]] = []
        raw_proofs = mapping.get("proofs", [])
        if not isinstance(raw_proofs, list):
            self.structure(f"{label}.proofs must be a list", area_id=area_id, target_id=target_id)
        else:
            for index, raw in enumerate(raw_proofs):
                item_label = f"{label}.proofs[{index}]"
                item = self.mapping(
                    raw,
                    item_label,
                    allowed={"path", "claims"},
                    required={"path", "claims"},
                    area_id=area_id,
                    target_id=target_id,
                )
                if item is None:
                    continue
                path = self.reference(
                    item.get("path"), f"{item_label}.path", area_id=area_id, target_id=target_id
                )
                claims = self.string_list(
                    item.get("claims"),
                    f"{item_label}.claims",
                    area_id=area_id,
                    target_id=target_id,
                )
                if path is not None and claims:
                    proofs.append((path, set(claims)))
        proof_paths = [path for path, _ in proofs]
        for duplicate in self.duplicates(proof_paths):
            self.structure(
                f"{label} contains duplicate proof path {duplicate}",
                area_id=area_id,
                target_id=target_id,
                path=duplicate,
            )
        return {"checkpoints": checkpoints, "proofs": proofs}

    def projection(
        self, value: Any, index: int, *, area_id: str, catalog_targets: set[str]
    ) -> dict[str, Any] | None:
        """Parse one reusable area-local projection."""
        label = f"area {area_id}.projections[{index}]"
        item = self.mapping(
            value,
            label,
            allowed={"id", "targets", "checkpoints", "proofs"},
            required={"id", "targets"},
            area_id=area_id,
        )
        if item is None:
            return None
        projection_id = self.text(item.get("id"), f"{label}.id", area_id=area_id, stable_id=True)
        targets = self.string_list(
            item.get("targets"), f"{label}.targets", area_id=area_id, stable_ids=True
        )
        for target in sorted(set(targets) - catalog_targets):
            self.structure(
                f"projection target {target} is absent from the target catalog",
                area_id=area_id,
                target_id=target,
            )
        component = self.component(
            {key: item[key] for key in ("checkpoints", "proofs") if key in item},
            label,
            area_id=area_id,
        )
        if not component["checkpoints"] and not component["proofs"]:
            self.structure(f"{label} must contain a checkpoint or proof", area_id=area_id)
        return {"id": projection_id, "targets": targets, **component}

    def target_route(
        self, value: Any, index: int, *, area_id: str
    ) -> dict[str, Any] | None:
        """Parse one target-local route, including an optional explicit gap."""
        label = f"area {area_id}.target_routes[{index}]"
        item = self.mapping(
            value,
            label,
            allowed={"target", "gap_kind", "reason", "owner", "checkpoints", "proofs"},
            required={"target"},
            area_id=area_id,
        )
        if item is None:
            return None
        target = self.text(
            item.get("target"), f"{label}.target", area_id=area_id, stable_id=True
        )
        gap_kind = item.get("gap_kind")
        if gap_kind is not None and gap_kind not in {"implementation", "proof"}:
            self.structure(
                f"{label}.gap_kind must be implementation or proof",
                area_id=area_id,
                target_id=target,
            )
            gap_kind = None
        if gap_kind is not None:
            self.text(
                item.get("reason"), f"{label}.reason", area_id=area_id, target_id=target
            )
            if "owner" in item:
                self.text(
                    item.get("owner"), f"{label}.owner", area_id=area_id, target_id=target
                )
        elif "reason" in item or "owner" in item:
            self.structure(
                f"{label}.reason and owner require gap_kind",
                area_id=area_id,
                target_id=target,
            )
        component = self.component(
            {key: item[key] for key in ("checkpoints", "proofs") if key in item},
            label,
            area_id=area_id,
            target_id=target,
        )
        return {"target": target, "gap_kind": gap_kind, **component}

    def validate(self) -> dict[str, Any]:
        """Load both authorities, validate every area, and return one pack envelope."""
        inputs = authority_inputs(self)
        if inputs is None:
            return self.result()
        targets, areas = inputs
        ordered_areas = sorted(
            areas,
            key=lambda value: (
                str(value.get("id", "")) if isinstance(value, dict) else "",
                repr(value),
            ),
        )
        for index, area in enumerate(ordered_areas):
            validate_area(self, area, index, catalog_targets=targets)
        area_ids = [
            area.get("id")
            for area in areas
            if isinstance(area, dict) and isinstance(area.get("id"), str)
        ]
        for duplicate in self.duplicates(area_ids):
            self.structure(f"duplicate area id {duplicate}", area_id=duplicate)
        return self.result()

    def result(self) -> dict[str, Any]:
        """Order and cap findings before returning the existing checker envelope."""
        ordered = sorted(
            self.findings,
            key=lambda item: (
                item["rule_id"],
                item.get("area_id", ""),
                item.get("target_id", ""),
                item.get("path", ""),
                item["message"],
            ),
        )
        if self.truncated:
            ordered = ordered[: FINDING_LIMIT - 1]
            ordered.append(
                _finding(
                    STRUCTURE_RULE,
                    f"finding limit {FINDING_LIMIT} exceeded; remaining findings omitted",
                )
            )
        return {"status": "failed" if ordered else "passed", "findings": ordered}


def validate_kmp_surface(
    root: Path,
    *,
    subject: ValidationSubject | None = None,
    include_gaps: bool = True,
) -> dict[str, Any]:
    """Validate the conventional graph through one explicit subject view."""
    selected = subject or ValidationSubject.from_runtime(root)
    validator = _Validator(selected, include_gaps=include_gaps)
    try:
        return validator.validate()
    except _FindingLimitReached:
        return validator.result()
