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
    "central-observability-lens.md",
    "telemetry lifecycle",
    "receipt invalidator",
    "duplicated proof cache",
    "agent-dispatch",
    "skills closeout",
    "execution-roles.yaml",
    "governed-implementation",
    "implementation-quality-review",
    "capability tier",
    "packet ready",
    "native-host launches use the governed route",
    "claude-opus-5",
    "claude-fable-5",
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

    def test_source_provider_adapters_reference_only_live_shared_skills(self) -> None:
        """Prevent thin source adapters from outliving the runtime skills they reference."""
        sources = [ROOT / "CLAUDE.md", ROOT / "CODEX.md"]
        for directory in (ROOT / ".claude/agents", ROOT / ".codex/agents"):
            if directory.is_dir():
                sources.extend(path for path in directory.iterdir() if path.is_file())
        combined = "\n".join(path.read_text(encoding="utf-8") for path in sources)
        for reference in INTERNAL_PATH.findall(combined):
            relative = reference.removeprefix(RUNTIME_PREFIX)
            self.assertTrue(
                (SKILLS_SOURCE / relative).exists(),
                f"source adapter names missing {reference}",
            )
        self.assertNotIn("role catalog", combined.lower())
        self.assertFalse((ROOT / ".claude/agent-profiles.json").exists())
        self.assertFalse((ROOT / ".codex/agent-profiles.json").exists())

    def test_live_docs_do_not_claim_retired_runtime_commands(self) -> None:
        """Keep current architecture and operating guidance on the public CLI surface."""
        sources = []
        for directory in (
            ROOT / "docs/architecture",
            ROOT / "docs/governance",
            ROOT / "docs/guides",
            ROOT / "docs/reference",
            ROOT / "docs/specs",
        ):
            sources.extend(path for path in directory.rglob("*.md") if path.is_file())
        combined = "\n".join(path.read_text(encoding="utf-8") for path in sources).lower()
        for retired in (
            "project-governance agent-dispatch",
            "project-governance agent-route",
            "project-governance skills closeout",
            "generic skill closeout",
        ):
            self.assertNotIn(retired, combined)

    def test_work_and_review_skills_define_the_lean_loop(self) -> None:
        """Keep installed agent guidance proportional to changed behavior and risk."""
        skill_text = {
            name: (SKILLS_SOURCE / name / "SKILL.md").read_text(encoding="utf-8").lower()
            for name in (
                "work",
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

        governed = skill_text["work"]
        for required in (
            "one focused owner test",
            "one directly affected seam",
            "branch-aware impacted pre-push sign-off",
            "do not run a separate manual pre-commit or pre-pr gate",
            "one primary-owned",
            "one affected recheck",
            "starting another general qa",
            "fails twice",
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
        self.assertIn("delivery: local-only | pr <url> | merged <sha>", plan_template)
        self.assertNotIn("one impacted pre-commit boundary", plan_template)
        self.assertNotIn("## execution rules", plan_template)

        for review_skill in (skill_text["architecture-review"],):
            self.assertIn("over 500 lines", review_skill)
            self.assertIn("cohesive narrow unit may be accepted", review_skill)
            self.assertIn("helper extraction", review_skill)
            self.assertIn("meaningful owner", review_skill)

        delegated = (SKILLS_SOURCE / "delegated-execution" / "SKILL.md").read_text(
            encoding="utf-8"
        ).lower()
        work = skill_text["work"]
        for instruction in (delegated, work):
            self.assertIn("current checkout", instruction)
            self.assertIn("delegation", instruction)
            self.assertIn("operator", instruction)
            self.assertIn("worktree", instruction)
        for instruction in (delegated, work):
            self.assertIn("path", instruction)
            self.assertIn("retained or removed", instruction)

        authoring = (SKILLS_SOURCE / "technical-authoring" / "SKILL.md").read_text(
            encoding="utf-8"
        ).lower()
        field_guide = (SKILLS_SOURCE / "resources" / "reader-first-authoring.md").read_text(
            encoding="utf-8"
        ).lower()
        for required in (
            "reader-first-authoring.md",
            "current public sources",
            "untrusted",
            "direct citations",
            "capability catalog",
        ):
            self.assertIn(required, authoring)
        for required in (
            "goal -> constraint -> mental model",
            "local truth",
            "research bounded gaps",
            "embedded instructions",
            "one canonical owner",
        ):
            self.assertIn(required, field_guide)

    def test_change_narrative_guidance_stays_product_level(self) -> None:
        """Keep commit and PR workflows conceptual, shared, and outside deep review."""
        change_narrative = (
            SKILLS_SOURCE / "resources" / "change-narrative.md"
        ).read_text(encoding="utf-8").lower()
        for required in (
            "product impact",
            "nature of change",
            "code areas impacted",
            "how the change surfaces",
            "file-path inventory",
            "perform code review",
        ):
            self.assertIn(required, change_narrative)
        self.assertNotIn("## validation", change_narrative)
        self.assertNotIn("risks or required action", change_narrative)
        template = (ROOT / ".github/pull_request_template.md").read_text(
            encoding="utf-8"
        ).lower()
        self.assertNotIn("## validation", template)
        self.assertNotIn("risks or required action", template)
        user_guide = (ROOT / "docs/guides/user-guide.md").read_text(
            encoding="utf-8"
        )
        self.assertIn("git rev-parse --git-path PR_TITLE", user_guide)
        self.assertIn("git rev-parse --git-path PR_DESCRIPTION.md", user_guide)
        self.assertIn("fails closed", user_guide)
        self.assertIn("checks only the pull request title and body", user_guide)
        self.assertIn("--pack pr-description --stage pre-pr", user_guide)
        impact_planning = (
            SKILLS_SOURCE / "impact-planning" / "SKILL.md"
        ).read_text(encoding="utf-8").lower()
        self.assertIn("plan --stage pre-push --mode impacted", impact_planning)
        self.assertNotIn("plan --stage pre-pr --mode impacted", impact_planning)
        hook_operation = (
            SKILLS_SOURCE / "hook-check-operation" / "SKILL.md"
        ).read_text(encoding="utf-8").lower()
        self.assertIn("pre-pr hook names only `pr-description`", hook_operation)
        self.assertNotIn("pre-pr aggregation", hook_operation)
        for workflow in (
            "commit-message-workflow",
            "pr-description-workflow",
        ):
            text = (
                SKILLS_SOURCE
                / "pattern-packs/delivery-quality"
                / workflow
                / "SKILL.md"
            ).read_text(encoding="utf-8").lower()
            self.assertIn("change-narrative.md", text)
            self.assertIn("product impact", text)
            self.assertIn("nature of change", text)

    def test_materialized_release_skill_defines_one_candidate_cycle(self) -> None:
        """Keep installed release review candidate-bound and free of retired profiles."""
        from project_governance_runtime.installation import materialize_skills

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            materialize_skills(root)
            release_review = (
                root
                / ".governance/runtime/skills/release-readiness-review/SKILL.md"
            ).read_text(encoding="utf-8").lower()
        for required in (
            "one exact publication candidate",
            "same candidate branch",
            "complete declared release proof once",
            "before merge or tag",
            "new candidate",
            "publication readback",
            "smoke or post-deploy evidence",
        ):
            self.assertIn(required, release_review)
        for retired in (
            "ci.release_profiles",
            "ci.smoke_checks",
            "configured release profile",
            "dry-run equivalent",
        ):
            self.assertNotIn(retired, release_review)


if __name__ == "__main__":
    unittest.main()
