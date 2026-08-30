"""Exercise optional KMP surface validation through one installed wheel."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable


Run = Callable[..., Any]


def _write(root: Path, relative: str, content: str = "fixture\n") -> None:
    """Write one synthetic adopter-owned file."""
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _enable(root: Path) -> None:
    """Create one deliberate adopter pack, graph, catalog, and context route."""
    _write(
        root,
        "config/governance/profile.yaml",
        "schema_version: 1\n"
        "project_extensions: []\n"
        "context_router:\n"
        "  routes:\n"
        "    - id: kmp\n"
        "      skills: [kmp-implementation]\n",
    )
    pack = {
        "id": "kmp-surface-validation",
        "implementation_status": "active",
        "enforcement": "blocking",
        "stages": ["release"],
        "run_when": "matched",
        "path_globs": ["config/validation/**", "ui/**", "shared/**", "contracts/**"],
        "depends_on": [],
        "commands": [{"builtin": "kmp-surface-validation"}],
    }
    _write(
        root,
        "config/validation/packs/kmp-surface-validation.yaml",
        json.dumps(pack, indent=2) + "\n",
    )
    catalog = {
        "kind": "kmp-surface-target-catalog",
        "schema_version": 1,
        "targets": ["web", "native-ios"],
    }
    _write(
        root,
        "config/validation/kmp-surface-targets.json",
        json.dumps(catalog, indent=2) + "\n",
    )
    graph = {
        "kind": "kmp-surface-validation",
        "schema_version": 1,
        "target_catalog": "config/validation/kmp-surface-targets.json",
        "areas": [
            {
                "id": "shell",
                "summary": "Shared shell reaches each installed target.",
                "validation": "route",
                "contract": {"path": "contracts/shell.txt"},
                "shared_route": {
                    "checkpoints": [
                        {"role": "shared-owner", "path": "shared/Shell.kt"}
                    ]
                },
                "target_routes": [
                    {
                        "target": target,
                        "checkpoints": [
                            {"role": "renderer", "path": f"ui/{target}.txt"}
                        ],
                    }
                    for target in catalog["targets"]
                ],
            }
        ],
    }
    _write(
        root,
        "config/validation/kmp-surfaces.yaml",
        json.dumps(graph, indent=2) + "\n",
    )
    for relative in (
        "contracts/shell.txt",
        "shared/Shell.kt",
        "ui/web.txt",
        "ui/native-ios.txt",
    ):
        _write(root, relative)


def verify_kmp_surface(root: Path, command: Path, run: Run) -> None:
    """Prove installation is inert and explicit enablement works through the pack runner."""
    graph_path = root / "config/validation/kmp-surfaces.yaml"
    if graph_path.exists():
        raise RuntimeError("installed wheel created a KMP surface graph")
    disabled = run(
        [
            str(command),
            "plan",
            "--pack",
            "kmp-surface-validation",
            "--base-ref",
            "HEAD",
            "--json",
        ],
        root=root,
        expected=1,
    )
    if "unknown-explicit-pack" not in disabled.stdout:
        raise RuntimeError("installed wheel did not leave KMP surface validation disabled")

    _enable(root)
    run([str(command), "doctor"], root=root, expected=0)
    checked = run(
        [
            str(command),
            "check",
            "--pack",
            "kmp-surface-validation",
            "--stage",
            "release",
            "--mode",
            "all",
        ],
        root=root,
        expected=0,
    )
    if "kmp-surface-validation" not in checked.stdout:
        raise RuntimeError("installed wheel did not execute the KMP surface pack")
