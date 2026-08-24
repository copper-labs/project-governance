#!/usr/bin/env python3
"""Prove generic catalog traversal and canonical nested-skill resolution."""

from __future__ import annotations

import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "src/project_governance_runtime/assets/skills"
sys.path.insert(0, str(ROOT / "src"))

from project_governance_runtime.installation import materialize_skills  # noqa: E402
from project_governance_runtime.skill_catalog import (  # noqa: E402
    SkillCatalogError,
    build_skill_index,
    canonical_skill_bytes,
)


def portable_skill(name: str) -> str:
    """Return the smallest valid portable skill fixture."""
    return f"---\nname: {name}\ndescription: Test {name}.\n---\n\n# {name}\n"


def write_minimal_catalog(root: Path, skills: list[dict[str, object]]) -> None:
    """Create a small catalog tree for rejection-path tests."""
    root.mkdir(parents=True, exist_ok=True)
    (root / "catalog.yaml").write_text(
        yaml.safe_dump({"standard_skills": skills, "stack_packs": [], "pattern_packs": []}),
        encoding="utf-8",
    )


class RuntimeSkillCatalogTests(unittest.TestCase):
    """Keep one catalog authority for top-level and nested package skills."""

    def test_index_resolves_nested_skills_and_shared_router_attachments(self) -> None:
        """Traverse manifests and treat repeated router references as attachments."""
        index = build_skill_index(ASSETS)
        self.assertIn("kotlin-testing-kmp", index)
        router = index["kmp-implementation"]
        self.assertEqual(
            router["router_for"], ["kmp-stack-pack", "kmp-advanced-bridge-pack"]
        )
        self.assertEqual(router["activation_mode"], "governed")
        self.assertEqual(
            hashlib.sha256(canonical_skill_bytes(router)).hexdigest(),
            hashlib.sha256((ASSETS / "kmp-implementation/SKILL.md").read_bytes()).hexdigest(),
        )

    def test_source_and_materialized_layouts_resolve_identical_skill_bytes(self) -> None:
        """Prove package and bootstrapped copies share the same canonical identities."""
        source = build_skill_index(ASSETS)
        source_digests = {
            skill_id: hashlib.sha256(canonical_skill_bytes(record)).hexdigest()
            for skill_id, record in source.items()
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            materialize_skills(root)
            installed = build_skill_index(root / ".governance/runtime/skills")
            installed_digests = {
                skill_id: hashlib.sha256(canonical_skill_bytes(record)).hexdigest()
                for skill_id, record in installed.items()
            }
        self.assertEqual(source_digests, installed_digests)

    def test_index_rejects_duplicate_ids_escaping_paths_and_portable_name_mismatch(self) -> None:
        """Fail closed on ambiguous or unsafe catalog ownership."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skill = root / "one/SKILL.md"
            skill.parent.mkdir(parents=True)
            skill.write_text(portable_skill("wrong-name"), encoding="utf-8")
            write_minimal_catalog(
                root,
                [
                    {
                        "id": "one",
                        "path": ".governance/runtime/skills/one/SKILL.md",
                        "portable": True,
                    }
                ],
            )
            with self.assertRaisesRegex(SkillCatalogError, "frontmatter name"):
                build_skill_index(root)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            one = root / "one/SKILL.md"
            two = root / "two/SKILL.md"
            one.parent.mkdir(parents=True)
            two.parent.mkdir(parents=True)
            one.write_text(portable_skill("same"), encoding="utf-8")
            two.write_text(portable_skill("same"), encoding="utf-8")
            write_minimal_catalog(
                root,
                [
                    {"id": "same", "path": ".governance/runtime/skills/one/SKILL.md"},
                    {"id": "same", "path": ".governance/runtime/skills/two/SKILL.md"},
                ],
            )
            with self.assertRaisesRegex(SkillCatalogError, "duplicate skill id"):
                build_skill_index(root)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_minimal_catalog(
                root,
                [{"id": "escape", "path": ".governance/runtime/skills/../escape.md"}],
            )
            with self.assertRaisesRegex(SkillCatalogError, "stay inside"):
                build_skill_index(root)

    def test_index_rejects_multiple_capability_owners(self) -> None:
        """Keep one active owner for each declared decision capability."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ("one", "two"):
                skill = root / name / "SKILL.md"
                skill.parent.mkdir(parents=True)
                skill.write_text(portable_skill(name), encoding="utf-8")
            write_minimal_catalog(
                root,
                [
                    {
                        "id": "one",
                        "path": ".governance/runtime/skills/one/SKILL.md",
                        "capability_owner": "same-capability",
                    },
                    {
                        "id": "two",
                        "path": ".governance/runtime/skills/two/SKILL.md",
                        "capability_owner": "same-capability",
                    },
                ],
            )
            with self.assertRaisesRegex(SkillCatalogError, "already owned"):
                build_skill_index(root)


if __name__ == "__main__":
    unittest.main()
