"""Compose one KMP surface area across every catalog target."""

from __future__ import annotations

from typing import Any


AREA_FIELDS = {
    "id", "summary", "validation", "contract", "required_checkpoint_roles",
    "required_proof_claims", "required_target_proof_claims", "shared_route",
    "projections", "target_routes",
}
REQUIREMENT_FIELDS = {
    "required_checkpoint_roles", "required_proof_claims", "required_target_proof_claims",
}


def _ordered(values: list[Any], key: str) -> list[Any]:
    """Canonicalize one semantically unordered list by stable identity and content."""
    return sorted(
        values,
        key=lambda value: (
            str(value.get(key, "")) if isinstance(value, dict) else "",
            repr(value),
        ),
    )


def _area_header(
    validator: Any, value: Any, index: int
) -> tuple[dict[str, Any], str, str, dict[str, Any]] | None:
    """Parse the area identity, validation depth, contract, and shared route."""
    label = f"areas[{index}]"
    item = validator.mapping(
        value, label, allowed=AREA_FIELDS,
        required={"id", "summary", "validation", "contract", "shared_route"},
    )
    if item is None:
        return None
    area_id = validator.text(item.get("id"), f"{label}.id", stable_id=True) or label
    validator.text(item.get("summary"), f"area {area_id}.summary", area_id=area_id)
    validation = item.get("validation")
    if validation not in {"route", "guarded"}:
        validator.structure(
            f"area {area_id}.validation must be route or guarded", area_id=area_id
        )
        validation = "route"
    contract = validator.mapping(
        item.get("contract"), f"area {area_id}.contract", allowed={"path"},
        required={"path"}, area_id=area_id,
    )
    if contract is not None:
        validator.reference(contract.get("path"), "contract.path", area_id=area_id)
    shared = validator.component(item.get("shared_route"), "shared_route", area_id=area_id)
    if not shared["checkpoints"]:
        validator.structure("shared_route requires a checkpoint", area_id=area_id)
    return item, area_id, validation, shared


def _requirements(
    validator: Any,
    item: dict[str, Any],
    area_id: str,
    validation: str,
    shared: dict[str, Any],
) -> tuple[list[str], list[str], list[str]]:
    """Parse guarded obligations or reject them from one shallow route."""
    if validation == "route":
        for field in sorted(REQUIREMENT_FIELDS & set(item)):
            validator.structure(f"route area cannot contain {field}", area_id=area_id)
        return [], [], []
    roles = validator.string_list(
        item.get("required_checkpoint_roles"), "required_checkpoint_roles", area_id=area_id
    )
    proofs = validator.string_list(
        item.get("required_proof_claims"), "required_proof_claims", area_id=area_id
    )
    target_proofs = validator.string_list(
        item.get("required_target_proof_claims"),
        "required_target_proof_claims", area_id=area_id,
    )
    if not set(target_proofs).issubset(proofs):
        validator.structure(
            "required_target_proof_claims must be a subset of required_proof_claims",
            area_id=area_id,
        )
    if not shared["proofs"]:
        validator.structure("guarded shared_route requires a proof", area_id=area_id)
    return roles, proofs, target_proofs


def _projections(
    validator: Any, item: dict[str, Any], area_id: str, catalog_targets: list[str]
) -> list[dict[str, Any]]:
    """Parse projections and enforce unique area-local identities."""
    raw = item.get("projections", [])
    if not isinstance(raw, list):
        validator.structure("projections must be a list", area_id=area_id)
        return []
    result = [
        projection
        for index, value in enumerate(_ordered(raw, "id"))
        if (projection := validator.projection(
            value, index, area_id=area_id, catalog_targets=set(catalog_targets)
        )) is not None
    ]
    identifiers = [value["id"] for value in result if value["id"]]
    for duplicate in sorted(
        {value for value in identifiers if identifiers.count(value) > 1}
    ):
        validator.structure(f"duplicate projection id {duplicate}", area_id=area_id)
    return result


def _routes(
    validator: Any, item: dict[str, Any], area_id: str, catalog_targets: list[str]
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    """Parse target routes and reject duplicate or unknown target identities."""
    raw = item.get("target_routes", [])
    if not isinstance(raw, list):
        validator.structure("target_routes must be a list", area_id=area_id)
        return [], {}
    routes = [
        route
        for index, value in enumerate(_ordered(raw, "target"))
        if (route := validator.target_route(value, index, area_id=area_id)) is not None
    ]
    targets = [route["target"] for route in routes if route["target"]]
    for duplicate in sorted({target for target in targets if targets.count(target) > 1}):
        validator.structure(
            f"duplicate target route {duplicate}", area_id=area_id, target_id=duplicate
        )
    for unknown in sorted(set(targets) - set(catalog_targets)):
        validator.structure(
            f"target route {unknown} is absent from the target catalog",
            area_id=area_id, target_id=unknown,
        )
    by_target = {
        route["target"]: route for route in routes if route["target"] in catalog_targets
    }
    return routes, by_target


def _composition(
    shared: dict[str, Any], projections: list[dict[str, Any]],
    route: dict[str, Any], target: str,
) -> tuple[set[str], set[str], set[str]]:
    """Combine shared, matching projection, and target-local roles and claims."""
    checkpoints = [*shared["checkpoints"]]
    proofs = [*shared["proofs"]]
    for projection in projections:
        if target in projection["targets"]:
            checkpoints.extend(projection["checkpoints"])
            proofs.extend(projection["proofs"])
    checkpoints.extend(route["checkpoints"])
    proofs.extend(route["proofs"])
    roles = {role for role, _ in checkpoints}
    claims = {claim for _, values in proofs for claim in values}
    target_claims = {claim for _, values in route["proofs"] for claim in values}
    return roles, claims, target_claims


def _declared_gap(
    validator: Any,
    route: dict[str, Any],
    *, validation: str, area_id: str, target: str,
    required_roles: list[str], roles: set[str],
) -> bool:
    """Validate and report one explicit implementation or proof gap."""
    if route["gap_kind"] == "implementation":
        if validator.include_gaps:
            validator.add(
                validator.implementation_rule,
                "target route declares an implementation gap",
                area_id=area_id, target_id=target,
            )
        return True
    if route["gap_kind"] != "proof":
        return False
    if validation == "route":
        validator.structure(
            "proof gap is invalid on a route area", area_id=area_id, target_id=target
        )
    if not route["checkpoints"] or set(required_roles) - roles:
        validator.structure(
            "proof gap requires a complete implementation route",
            area_id=area_id, target_id=target,
        )
    if validator.include_gaps and validation == "guarded":
        validator.add(
            validator.proof_rule, "target route declares a proof gap",
            area_id=area_id, target_id=target,
        )
    return True


def _complete_route(
    validator: Any,
    route: dict[str, Any],
    *, validation: str, area_id: str, target: str,
    requirements: tuple[list[str], list[str], list[str]],
    composition: tuple[set[str], set[str], set[str]],
) -> None:
    """Report implementation and proof obligations for one undeclared target route."""
    required_roles, required_proofs, required_target_proofs = requirements
    roles, claims, target_claims = composition
    missing_roles = sorted(set(required_roles) - roles)
    if validator.include_gaps and (not route["checkpoints"] or missing_roles):
        detail = ", ".join(missing_roles) or "target-local checkpoint"
        validator.add(
            validator.implementation_rule, f"target implementation is missing {detail}",
            area_id=area_id, target_id=target,
        )
    if validation != "guarded":
        return
    missing_proofs = sorted(set(required_proofs) - claims)
    missing_target = sorted(set(required_target_proofs) - target_claims)
    if validator.include_gaps and (not route["proofs"] or missing_proofs or missing_target):
        detail = sorted(set(missing_proofs + missing_target))
        suffix = f": {', '.join(detail)}" if detail else ""
        validator.add(
            validator.proof_rule, f"target proof is incomplete{suffix}",
            area_id=area_id, target_id=target,
        )


def _validate_target(
    validator: Any,
    route: dict[str, Any] | None,
    *, validation: str, area_id: str, target: str,
    shared: dict[str, Any], projections: list[dict[str, Any]],
    requirements: tuple[list[str], list[str], list[str]],
) -> None:
    """Validate one catalog target without inferring applicability or proof."""
    if route is None:
        if validator.include_gaps:
            validator.add(
                validator.implementation_rule, "catalog target has no route for this area",
                area_id=area_id, target_id=target,
            )
        return
    composition = _composition(shared, projections, route, target)
    if _declared_gap(
        validator, route, validation=validation, area_id=area_id, target=target,
        required_roles=requirements[0], roles=composition[0],
    ):
        return
    _complete_route(
        validator, route, validation=validation, area_id=area_id, target=target,
        requirements=requirements, composition=composition,
    )


def validate_area(
    validator: Any, value: Any, index: int, *, catalog_targets: list[str]
) -> None:
    """Validate one route or guarded area across every catalog target."""
    header = _area_header(validator, value, index)
    if header is None:
        return
    item, area_id, validation, shared = header
    requirements = _requirements(validator, item, area_id, validation, shared)
    projections = _projections(validator, item, area_id, catalog_targets)
    routes, route_by_target = _routes(validator, item, area_id, catalog_targets)
    if validation == "route" and (
        shared["proofs"] or any(value["proofs"] for value in projections + routes)
    ):
        validator.structure("route area cannot contain proofs", area_id=area_id)
    for target in sorted(catalog_targets):
        _validate_target(
            validator, route_by_target.get(target), validation=validation,
            area_id=area_id, target=target, shared=shared, projections=projections,
            requirements=requirements,
        )
