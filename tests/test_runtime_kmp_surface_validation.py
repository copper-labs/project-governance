#!/usr/bin/env python3
"""Prove bounded, subject-consistent KMP surface validation behavior."""

from __future__ import annotations

import json
import io
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from contextlib import redirect_stdout
from unittest.mock import patch

import yaml


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from project_governance_runtime.changed_paths import resolve_change_scope  # noqa: E402
from project_governance_runtime.checkers import main as checker_main  # noqa: E402
from project_governance_runtime.execution_flow import execution_environment  # noqa: E402
from project_governance_runtime.kmp_surface_doctor import (  # noqa: E402
    kmp_surface_doctor_findings,
)
from project_governance_runtime.kmp_surface_validation import (  # noqa: E402
    IMPLEMENTATION_RULE,
    PROOF_RULE,
    REFERENCE_RULE,
    STRUCTURE_RULE,
    validate_kmp_surface,
)
from project_governance_runtime.validation_subject import ValidationSubject  # noqa: E402


def run(root: Path, *arguments: str) -> str:
    """Run one deterministic Git fixture command."""
    result = subprocess.run(arguments, cwd=root, text=True, capture_output=True, check=False)
    if result.returncode != 0:
        raise AssertionError(result.stderr or result.stdout)
    return result.stdout.strip()


def write_file(root: Path, relative: str, text: str = "fixture\n") -> None:
    """Write one ordinary subject member used by a graph reference."""
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def target_route(target: str, *, guarded: bool = False) -> dict[str, object]:
    """Return one complete target-local route fixture."""
    route: dict[str, object] = {
        "target": target,
        "checkpoints": [{"role": "renderer", "path": f"ui/{target}.txt"}],
    }
    if guarded:
        route["proofs"] = [{"path": f"ui/{target}.test", "claims": ["visible"]}]
    return route


def area(area_id: str, targets: list[str], *, guarded: bool = False) -> dict[str, object]:
    """Return one complete shallow or guarded area fixture."""
    value: dict[str, object] = {
        "id": area_id,
        "summary": f"{area_id} reaches every target.",
        "validation": "guarded" if guarded else "route",
        "contract": {"path": f"docs/specs/{area_id}.md"},
        "shared_route": {
            "checkpoints": [{"role": "shared-owner", "path": f"shared/{area_id}.kt"}]
        },
        "target_routes": [target_route(target, guarded=guarded) for target in targets],
    }
    if guarded:
        value.update(
            {
                "required_checkpoint_roles": ["shared-owner", "renderer"],
                "required_proof_claims": ["behavior", "visible"],
                "required_target_proof_claims": ["visible"],
            }
        )
        value["shared_route"]["proofs"] = [
            {"path": f"shared/{area_id}.test", "claims": ["behavior"]}
        ]
    return value


def write_surface(
    root: Path,
    *,
    targets: list[str] | None = None,
    areas: list[dict[str, object]] | None = None,
) -> tuple[dict[str, object], dict[str, object]]:
    """Write one complete graph, catalog, and every referenced ordinary file."""
    selected_targets = targets or ["web"]
    selected_areas = areas or [area("shell", selected_targets)]
    catalog = {
        "kind": "kmp-surface-target-catalog",
        "schema_version": 1,
        "targets": selected_targets,
    }
    graph = {
        "kind": "kmp-surface-validation",
        "schema_version": 1,
        "target_catalog": "config/validation/kmp-surface-targets.json",
        "areas": selected_areas,
    }
    write_file(
        root,
        "config/validation/kmp-surface-targets.json",
        json.dumps(catalog, indent=2) + "\n",
    )
    write_file(
        root,
        "config/validation/kmp-surfaces.yaml",
        yaml.safe_dump(graph, sort_keys=False),
    )
    for selected_area in selected_areas:
        area_id = str(selected_area["id"])
        write_file(root, f"docs/specs/{area_id}.md")
        write_file(root, f"shared/{area_id}.kt")
        if selected_area["validation"] == "guarded":
            write_file(root, f"shared/{area_id}.test")
        for target in selected_targets:
            write_file(root, f"ui/{target}.txt")
            if selected_area["validation"] == "guarded":
                write_file(root, f"ui/{target}.test")
    return graph, catalog


def live_result(root: Path, *, include_gaps: bool = True) -> dict[str, object]:
    """Validate one explicit live checkout subject."""
    return validate_kmp_surface(
        root,
        subject=ValidationSubject.live_checkout(root),
        include_gaps=include_gaps,
    )


class RuntimeKmpSurfaceValidationTests(unittest.TestCase):
    """Keep the opt-in KMP graph complete, lean, and fail-closed."""

    def test_shallow_and_guarded_complete_areas_pass(self) -> None:
        """Accept shallow routing without proof and guarded target-local proof."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            targets = ["web", "bridge-ios"]
            write_surface(
                root,
                targets=targets,
                areas=[area("shell", targets), area("timed-state", targets, guarded=True)],
            )

            result = live_result(root)

        self.assertEqual(result, {"status": "passed", "findings": []})

    def test_shared_proof_cannot_satisfy_target_local_claim(self) -> None:
        """Close the loophole that would let common proof stand in for visible host proof."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            guarded = area("timed-state", ["web"], guarded=True)
            guarded["shared_route"]["proofs"][0]["claims"].append("visible")
            guarded["target_routes"][0]["proofs"][0]["claims"] = ["smoke"]
            write_surface(root, areas=[guarded])

            result = live_result(root)

        self.assertEqual(result["status"], "failed")
        self.assertEqual([item["rule_id"] for item in result["findings"]], [PROOF_RULE])

    def test_new_catalog_target_and_declared_gaps_remain_blocking(self) -> None:
        """Distinguish missing implementation from an explicitly missing guarded proof."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            guarded = area("timed-state", ["web"], guarded=True)
            guarded["target_routes"][0]["gap_kind"] = "proof"
            guarded["target_routes"][0]["reason"] = "Host proof is pending."
            write_surface(root, targets=["web", "bridge-ios"], areas=[guarded])

            result = live_result(root)

        coordinates = {(item["rule_id"], item.get("target_id")) for item in result["findings"]}
        self.assertEqual(
            coordinates,
            {(IMPLEMENTATION_RULE, "bridge-ios"), (PROOF_RULE, "web")},
        )

    def test_route_proof_gap_and_applicability_fields_are_structurally_invalid(self) -> None:
        """Reject proof gaps on shallow areas and every applicability escape hatch."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shallow = area("shell", ["web"])
            shallow["target_routes"][0].update(
                {"gap_kind": "proof", "reason": "Invalid shallow proof gap."}
            )
            shallow["target_subset"] = ["web"]
            write_surface(root, areas=[shallow])

            result = live_result(root)

        self.assertTrue(result["findings"])
        self.assertEqual({item["rule_id"] for item in result["findings"]}, {STRUCTURE_RULE})

    def test_projection_targets_are_unique_catalog_members(self) -> None:
        """Allow shared adapter structure without admitting unknown or duplicate target rows."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            guarded = area("timed-state", ["web"], guarded=True)
            guarded["projections"] = [
                {
                    "id": "bridge",
                    "targets": ["web", "web", "unknown"],
                    "checkpoints": [{"role": "projection", "path": "shared/projection.kt"}],
                }
            ]
            write_surface(root, areas=[guarded])
            write_file(root, "shared/projection.kt")

            result = live_result(root)

        self.assertEqual({item["rule_id"] for item in result["findings"]}, {STRUCTURE_RULE})

    def test_duplicate_keys_and_unsafe_references_fail_closed(self) -> None:
        """Reject ambiguous YAML and symbolic links without following them."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_surface(root)
            graph_path = root / "config/validation/kmp-surfaces.yaml"
            graph_path.write_text(
                "kind: kmp-surface-validation\nkind: duplicate\nschema_version: 1\n"
                "target_catalog: config/validation/kmp-surface-targets.json\nareas: []\n",
                encoding="utf-8",
            )
            duplicate = live_result(root)

            write_surface(root)
            (root / "shared/shell.kt").unlink()
            (root / "shared/shell.kt").symlink_to(root / "docs/specs/shell.md")
            symlink = live_result(root)

        self.assertEqual(duplicate["findings"][0]["rule_id"], STRUCTURE_RULE)
        self.assertIn(REFERENCE_RULE, {item["rule_id"] for item in symlink["findings"]})

    def test_reusable_document_depth_size_key_and_path_limits_are_concrete(self) -> None:
        """Fail closed at every generic structured-document safety boundary."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_surface(root)
            (root / "config/validation/kmp-surfaces.yaml").write_bytes(b"x" * (256 * 1024 + 1))
            oversized = live_result(root)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_surface(root)
            nested: object = "leaf"
            for _ in range(33):
                nested = [nested]
            graph_path = root / "config/validation/kmp-surfaces.yaml"
            graph = yaml.safe_load(graph_path.read_text(encoding="utf-8"))
            graph["unexpected"] = nested
            graph_path.write_text(yaml.safe_dump(graph), encoding="utf-8")
            too_deep = live_result(root)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_surface(root)
            catalog_path = root / "config/validation/kmp-surface-targets.json"
            catalog_path.write_text(
                '{"kind":"kmp-surface-target-catalog","kind":"duplicate",'
                '"schema_version":1,"targets":["web"]}\n',
                encoding="utf-8",
            )
            duplicate_json = live_result(root)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            graph, _ = write_surface(root)
            graph["areas"][0]["contract"]["path"] = "a" * 4_097
            write_file(
                root,
                "config/validation/kmp-surfaces.yaml",
                yaml.safe_dump(graph, sort_keys=False),
            )
            oversized_path = live_result(root)

        for result in (oversized, too_deep, duplicate_json):
            self.assertEqual(result["findings"][0]["rule_id"], STRUCTURE_RULE)
        self.assertIn("4096", "\n".join(item["message"] for item in oversized_path["findings"]))

    def test_finding_output_is_deterministic_and_bounded(self) -> None:
        """Canonicalize equivalent ordering and stop at one 500-item result."""
        with tempfile.TemporaryDirectory() as first_directory, tempfile.TemporaryDirectory() as second_directory:
            first = Path(first_directory)
            second = Path(second_directory)
            targets = ["web", "bridge-ios"]
            first_areas = [area("zeta", [], guarded=True), area("alpha", [])]
            second_areas = list(reversed(first_areas))
            write_surface(first, targets=targets, areas=first_areas)
            write_surface(second, targets=list(reversed(targets)), areas=second_areas)
            self.assertEqual(live_result(first), live_result(second))

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            targets = [f"target-{index:03d}" for index in range(501)]
            write_surface(root, targets=targets, areas=[area("shell", [])])
            bounded = live_result(root)

        self.assertEqual(len(bounded["findings"]), 500)
        self.assertIn("finding limit", bounded["findings"][-1]["message"])

    def test_staged_subject_never_reads_unstaged_graph_or_reference(self) -> None:
        """Reconstruct base plus staged overlay instead of mixing in live checkout bytes."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            run(root, "git", "init", "-q", "-b", "main")
            run(root, "git", "config", "user.email", "runtime@example.invalid")
            run(root, "git", "config", "user.name", "Runtime Tests")
            write_surface(root)
            run(root, "git", "add", ".")
            run(root, "git", "commit", "-qm", "baseline")

            catalog_path = root / "config/validation/kmp-surface-targets.json"
            catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
            catalog["targets"].append("bridge-ios")
            catalog_path.write_text(json.dumps(catalog) + "\n", encoding="utf-8")
            run(root, "git", "add", catalog_path.relative_to(root).as_posix())

            graph_path = root / "config/validation/kmp-surfaces.yaml"
            graph = yaml.safe_load(graph_path.read_text(encoding="utf-8"))
            graph["areas"][0]["target_routes"].append(target_route("bridge-ios"))
            graph_path.write_text(yaml.safe_dump(graph, sort_keys=False), encoding="utf-8")
            write_file(root, "ui/bridge-ios.txt")

            scope = resolve_change_scope(root, staged=True)
            with execution_environment(root, {"change_scope": scope}) as environment:
                with patch.dict(os.environ, environment, clear=True):
                    result = validate_kmp_surface(root)

        self.assertEqual(result["status"], "failed")
        self.assertEqual({item["rule_id"] for item in result["findings"]}, {IMPLEMENTATION_RULE})

    def test_staged_reference_deletion_cannot_be_rescued_by_live_checkout(self) -> None:
        """Apply packet deletions before checking reference membership."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            run(root, "git", "init", "-q", "-b", "main")
            run(root, "git", "config", "user.email", "runtime@example.invalid")
            run(root, "git", "config", "user.name", "Runtime Tests")
            write_surface(root)
            run(root, "git", "add", ".")
            run(root, "git", "commit", "-qm", "baseline")
            run(root, "git", "rm", "-q", "shared/shell.kt")
            write_file(root, "shared/shell.kt", "unstaged replacement\n")
            scope = resolve_change_scope(root, staged=True)
            with execution_environment(root, {"change_scope": scope}) as environment:
                with patch.dict(os.environ, environment, clear=True):
                    result = validate_kmp_surface(root)

        self.assertIn(REFERENCE_RULE, {item["rule_id"] for item in result["findings"]})

    def test_doctor_accepts_adopter_stages_but_requires_route_local_wiring(self) -> None:
        """Keep lifecycle policy adopter-owned while ensuring agents can compose KMP leaves."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_surface(root)
            profile = {
                "profile_id": "fixture",
                "context_router": {
                    "routes": [{"id": "kmp", "skills": ["kmp-implementation"]}]
                },
            }
            write_file(
                root,
                "config/governance/profile.yaml",
                yaml.safe_dump(profile, sort_keys=False),
            )
            pack = {
                "id": "kmp-surface-validation",
                "implementation_status": "active",
                "enforcement": "blocking",
                "stages": ["nightly-review"],
                "path_globs": ["config/validation/**"],
                "commands": [{"builtin": "kmp-surface-validation"}],
            }
            self.assertEqual(
                kmp_surface_doctor_findings(root, {"kmp-surface-validation": pack}),
                [],
            )

            profile["context_router"] = {
                "default_skills": ["kmp-implementation"],
                "routes": [{"id": "kmp", "skills": []}],
            }
            write_file(
                root,
                "config/governance/profile.yaml",
                yaml.safe_dump(profile, sort_keys=False),
            )
            default_only = kmp_surface_doctor_findings(
                root, {"kmp-surface-validation": pack}
            )

        self.assertIn("route.skills", "\n".join(default_only))

    def test_doctor_rejects_nonstandard_or_incomplete_pack_wiring(self) -> None:
        """Use one conventional pack authority and require both documents in its selectors."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_surface(root)
            write_file(
                root,
                "config/governance/profile.yaml",
                yaml.safe_dump(
                    {
                        "context_router": {
                            "routes": [
                                {"id": "kmp", "skills": ["kmp-implementation"]}
                            ]
                        }
                    }
                ),
            )
            command = {"builtin": "kmp-surface-validation"}
            nonstandard = kmp_surface_doctor_findings(
                root,
                {
                    "custom": {
                        "implementation_status": "active",
                        "commands": [command],
                    }
                },
            )
            incomplete = kmp_surface_doctor_findings(
                root,
                {
                    "kmp-surface-validation": {
                        "implementation_status": "active",
                        "commands": [command],
                        "path_globs": ["config/validation/kmp-surfaces.yaml"],
                    }
                },
            )

        self.assertIn("exactly one active invocation", "\n".join(nonstandard))
        self.assertIn("kmp-surface-targets.json", "\n".join(incomplete))

    def test_existing_checker_dispatch_runs_the_builtin_without_graph_arguments(self) -> None:
        """Execute the fixed-path validator through the ordinary built-in command boundary."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            run(root, "git", "init", "-q", "-b", "main")
            run(root, "git", "config", "user.email", "runtime@example.invalid")
            run(root, "git", "config", "user.name", "Runtime Tests")
            write_surface(root)
            run(root, "git", "add", ".")
            run(root, "git", "commit", "-qm", "baseline")
            scope = resolve_change_scope(root, all_scope=True)
            output = io.StringIO()
            previous = Path.cwd()
            try:
                os.chdir(root)
                with execution_environment(root, {"change_scope": scope}) as environment:
                    with (
                        patch.dict(os.environ, environment, clear=True),
                        patch.object(
                            sys,
                            "argv",
                            ["project-governance-checkers", "kmp-surface-validation"],
                        ),
                        redirect_stdout(output),
                    ):
                        exit_code = checker_main()
            finally:
                os.chdir(previous)

        self.assertEqual(exit_code, 0)
        self.assertEqual(json.loads(output.getvalue())["status"], "passed")


if __name__ == "__main__":
    unittest.main()
