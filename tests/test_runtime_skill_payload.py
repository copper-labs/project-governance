#!/usr/bin/env python3
"""Keep wheel-owned skills self-contained and free of retired runtime instructions."""

from __future__ import annotations

import re
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILLS_SOURCE = ROOT / "src/project_governance_runtime/assets/skills"
sys.path.insert(0, str(ROOT / "src"))
RUNTIME_PREFIX = ".governance/runtime/skills/"
INTERNAL_PATH = re.compile(
    r"\.governance/runtime/skills/[A-Za-z0-9._/-]+"
)
FORBIDDEN_TEXT = (
    "scripts/check.py",
    "validate-template",
    "smoke-generate",
    "derived profile authority",
    "capture-evidence",
    "generated authoring workflow",
    "copied runtime tree",
    "generated runtime",
    "organizational application runtime",
    "knowledge graph runtime dependency",
    "telemetry lifecycle",
    "receipt invalidator",
    "duplicated proof cache",
)


class RuntimeSkillPayloadTests(unittest.TestCase):
    """Prove installed generic skill content has no hidden source-template dependency."""

    def test_internal_paths_resolve_after_materialization(self) -> None:
        """Every package-owned path named by a skill must exist in the installed tree."""
        from project_governance_runtime.installation import materialize_skills

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            materialize_skills(root)
            materialized_root = root / ".governance/runtime/skills"
            for source in SKILLS_SOURCE.rglob("*"):
                if not source.is_file():
                    continue
                text = source.read_text(encoding="utf-8")
                for reference in INTERNAL_PATH.findall(text):
                    relative = reference.removeprefix(RUNTIME_PREFIX)
                    self.assertTrue(
                        (materialized_root / relative).exists(),
                        f"{source.relative_to(ROOT)} names missing {reference}",
                    )

    def test_active_instructions_do_not_name_retired_machinery(self) -> None:
        """Keep the installed guidance aligned with the lean package authority."""
        text = "\n".join(
            source.read_text(encoding="utf-8")
            for source in SKILLS_SOURCE.rglob("*")
            if source.is_file() and source.suffix in {".md", ".yaml", ".yml"}
        ).lower()
        for forbidden in FORBIDDEN_TEXT:
            self.assertNotIn(forbidden, text)
        self.assertNotIn("parallel governance runtime mode", text)

    def test_work_and_review_skills_define_the_lean_loop(self) -> None:
        """Keep installed agent guidance proportional to changed behavior and risk."""
        skill_text = {
            name: (SKILLS_SOURCE / name / "SKILL.md").read_text(encoding="utf-8").lower()
            for name in (
                "governed-implementation",
                "work",
                "implementation-quality-review",
                "architecture-review",
            )
        }
        combined = "\n".join(skill_text.values())
        for retired in (
            "after every coherent source packet",
            "bind accepted cohesion to the exact source fingerprint",
            "run one dedicated qa pass",
            "central-observability-lens.md",
        ):
            self.assertNotIn(retired, combined)

        governed = skill_text["governed-implementation"]
        for required in (
            "one focused owner test",
            "one directly affected seam",
            "one branch-aware impacted pre-push sign-off",
            "do not run a separate manual pre-commit or pre-pr gate",
            "one primary-owned",
            "one affected recheck",
            "do not start a fresh general review",
            "second failure",
            "warnings",
        ):
            self.assertIn(required, governed)

        qa_review = (SKILLS_SOURCE / "qa-review" / "SKILL.md").read_text(
            encoding="utf-8"
        ).lower()
        self.assertIn("consume the stable candidate's existing affected sign-off", qa_review)
        self.assertIn("named changed seam with no evidence", qa_review)
        self.assertNotIn(
            "run impacted unit, integration, smoke, or release checks", qa_review
        )

        plan_template = (
            SKILLS_SOURCE / "resources" / "implementation-plan-template.md"
        ).read_text(encoding="utf-8").lower()
        self.assertIn("one branch-aware impacted pre-push sign-off", plan_template)
        self.assertNotIn("one impacted pre-commit boundary", plan_template)

        for review_skill in (
            skill_text["implementation-quality-review"],
            skill_text["architecture-review"],
        ):
            self.assertIn("over 500 lines", review_skill)
            self.assertIn("cohesive narrow unit may be accepted", review_skill)
            self.assertIn("helper extraction", review_skill)
            self.assertIn("meaningful owner", review_skill)


if __name__ == "__main__":
    unittest.main()
