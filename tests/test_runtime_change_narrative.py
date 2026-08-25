#!/usr/bin/env python3
"""Prove commits and pull requests carry one deterministic reader-first narrative."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from project_governance_runtime.configuration import load_packs  # noqa: E402
from project_governance_runtime.execution_commands import command_argv  # noqa: E402
from project_governance_runtime.planning import build_plan  # noqa: E402


VALID_COMMIT = """Explain changes before review

Product impact: Contributor workflow — authors see missing context before review.
Nature of change: Unified commit and pull request orientation around one shared narrative.
Code areas impacted: Delivery governance, agent authoring workflows.
Why: Reviewers had to reconstruct purpose and impact from file changes.
Validation: Focused narrative checker fixtures passed with no findings.
"""

VALID_PR = """## Outcome

Make change context understandable before a reader opens the diff.

## Product impact

- Contributor workflow: Authors see missing product context before review.
- Application behavior: Runtime product behavior is intentionally unchanged.

## Nature of the change

Unified commit and pull request orientation while keeping editorial judgment with people.

```text
## Outcome
This fenced example is not another section.
```

## Code areas impacted

- Delivery governance
- Agent authoring workflows

## Why

Reviewers had to reconstruct purpose and impact from file changes.

## Validation

- Focused narrative checker fixtures passed with no findings.

## Risks or required action

Adopters need the new runtime before the checks become active in their repositories.
"""


def git(root: Path, *arguments: str) -> str:
    """Run one quiet Git fixture command and return stdout."""
    return subprocess.run(
        ["git", "-C", str(root), *arguments],
        text=True,
        capture_output=True,
        check=True,
    ).stdout.strip()


class RuntimeChangeNarrativeTests(unittest.TestCase):
    """Keep structural enforcement useful without pretending to grade prose."""

    def run_checker(
        self,
        checker: str,
        path: Path | None = None,
        *,
        cwd: Path | None = None,
        environment: dict[str, str] | None = None,
    ) -> tuple[subprocess.CompletedProcess[str], dict[str, object]]:
        """Run one packaged checker and parse its normalized output."""
        arguments = [
            sys.executable,
            "-m",
            "project_governance_runtime.checkers",
            checker,
        ]
        if path is not None:
            arguments.append(str(path))
        result = subprocess.run(
            arguments,
            cwd=cwd or ROOT,
            env={
                **os.environ,
                "PYTHONPATH": str(ROOT / "src"),
                **(environment or {}),
            },
            text=True,
            capture_output=True,
            check=False,
        )
        return result, json.loads(result.stdout)

    def write_and_run(
        self,
        checker: str,
        content: str,
    ) -> tuple[subprocess.CompletedProcess[str], dict[str, object]]:
        """Run one checker against a temporary UTF-8 narrative."""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "narrative.md"
            path.write_text(content, encoding="utf-8")
            return self.run_checker(checker, path)

    def assert_rule(self, payload: dict[str, object], rule_id: str) -> None:
        """Assert one normalized rule appears in the checker result."""
        self.assertIn(
            rule_id,
            [finding["rule_id"] for finding in payload["findings"]],
            payload,
        )

    def test_valid_commit_contains_the_shared_narrative(self) -> None:
        """Accept one compact outcome, product impact, conceptual change, reason, and proof."""
        result, payload = self.write_and_run("commit-message", VALID_COMMIT)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(payload["status"], "passed")
        self.assertEqual(payload["findings"], [])

    def test_git_generated_commit_messages_keep_their_native_shape(self) -> None:
        """Do not break merge, revert, autosquash, or amend flows owned by Git."""
        subjects = (
            "Merge branch 'feature'",
            'Revert "Explain changes before review"',
            "fixup! Explain changes before review",
            "squash! Explain changes before review",
            "amend! Explain changes before review",
        )
        for subject in subjects:
            with self.subTest(subject=subject):
                result, payload = self.write_and_run("commit-message", subject + "\n")
                self.assertEqual(result.returncode, 0, payload)
                self.assertEqual(payload["status"], "passed")

    def test_commit_failures_have_stable_actionable_rules(self) -> None:
        """Reject short, missing, duplicate, out-of-order, and placeholder content."""
        cases = {
            "short": (VALID_COMMIT.replace("Explain changes before review", "Short", 1), "commit-message.short-subject"),
            "missing": (VALID_COMMIT.replace("Why: Reviewers had to reconstruct purpose and impact from file changes.\n", ""), "commit-message.field-missing"),
            "duplicate": (VALID_COMMIT + "Why: A second reason is not allowed.\n", "commit-message.field-duplicate"),
            "order": (VALID_COMMIT.replace(
                "Product impact: Contributor workflow — authors see missing context before review.\nNature of change: Unified commit and pull request orientation around one shared narrative.",
                "Nature of change: Unified commit and pull request orientation around one shared narrative.\nProduct impact: Contributor workflow — authors see missing context before review.",
            ), "commit-message.field-order"),
            "placeholder": (VALID_COMMIT.replace(
                "Nature of change: Unified commit and pull request orientation around one shared narrative.",
                "Nature of change: TBD",
            ), "commit-message.field-placeholder"),
            "trailer-is-not-validation": (VALID_COMMIT.replace(
                "Validation: Focused narrative checker fixtures passed with no findings.",
                "Validation:\n\nSigned-off-by: Example <example@example.invalid>",
            ), "commit-message.field-placeholder"),
        }
        for name, (content, rule_id) in cases.items():
            with self.subTest(name=name):
                result, payload = self.write_and_run("commit-message", content)
                self.assertEqual(result.returncode, 1, payload)
                self.assert_rule(payload, rule_id)

    def test_valid_pr_ignores_hidden_guidance_and_fenced_headings(self) -> None:
        """Accept ordered authored sections without treating examples as duplicate headings."""
        body = "<!-- Template guidance. -->\n" + VALID_PR
        result, payload = self.write_and_run("pr-description", body)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(payload["status"], "passed")

    def test_pr_failures_have_stable_actionable_rules(self) -> None:
        """Reject missing, duplicate, reordered, placeholder, and malformed list content."""
        cases = {
            "missing": (VALID_PR.replace(
                "## Why\n\nReviewers had to reconstruct purpose and impact from file changes.\n\n",
                "",
            ), "pr-description.section-missing"),
            "duplicate": (VALID_PR + "\n## Outcome\n\nA duplicate outcome.\n", "pr-description.section-duplicate"),
            "order": (VALID_PR.replace(
                "## Product impact\n\n- Contributor workflow: Authors see missing product context before review.\n- Application behavior: Runtime product behavior is intentionally unchanged.\n\n## Nature of the change",
                "## Nature of the change\n\nUnified orientation.\n\n## Product impact\n\n- Contributor workflow: Authors see missing product context before review.\n\n## Nature of the change",
            ), "pr-description.section-order"),
            "placeholder": (VALID_PR.replace(
                "Make change context understandable before a reader opens the diff.",
                "<One plain-language result for the pull request.>",
            ), "pr-description.field-placeholder"),
            "impact-shape": (VALID_PR.replace(
                "- Contributor workflow: Authors see missing product context before review.",
                "- Contributor workflow changes",
            ), "pr-description.product-impact-shape"),
            "code-area-list": (VALID_PR.replace(
                "- Delivery governance\n- Agent authoring workflows",
                "Delivery governance and agent authoring workflows.",
            ), "pr-description.bullets-missing"),
            "validation-list": (VALID_PR.replace(
                "- Focused narrative checker fixtures passed with no findings.",
                "Focused narrative checker fixtures passed with no findings.",
            ), "pr-description.bullets-missing"),
            "empty-optional": (VALID_PR.replace(
                "Adopters need the new runtime before the checks become active in their repositories.",
                "None",
            ), "pr-description.field-placeholder"),
        }
        for name, (content, rule_id) in cases.items():
            with self.subTest(name=name):
                result, payload = self.write_and_run("pr-description", content)
                self.assertEqual(result.returncode, 1, payload)
                self.assert_rule(payload, rule_id)

    def test_untouched_source_pr_template_is_not_a_valid_body(self) -> None:
        """Require authors to replace comments and angle-bracket prompts with real context."""
        result, payload = self.run_checker(
            "pr-description", ROOT / ".github/pull_request_template.md"
        )
        self.assertEqual(result.returncode, 1, payload)
        self.assert_rule(payload, "pr-description.field-placeholder")

    def test_missing_inputs_fail_closed(self) -> None:
        """Return normalized findings instead of treating absent commit or PR input as a no-op."""
        with tempfile.TemporaryDirectory() as directory:
            missing = Path(directory) / "absent.md"
            for checker, rule_id in (
                ("commit-message", "commit-message.file-missing"),
                ("pr-description", "pr-description.file-missing"),
            ):
                with self.subTest(checker=checker):
                    result, payload = self.run_checker(checker, missing)
                    self.assertEqual(result.returncode, 1, payload)
                    self.assert_rule(payload, rule_id)

    def test_default_inputs_are_isolated_in_linked_worktree_metadata(self) -> None:
        """Resolve local drafts through Git instead of the primary checkout's dot-git path."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "source"
            worktree = Path(directory) / "linked"
            root.mkdir()
            git(root, "init", "-q")
            git(root, "config", "user.email", "fixture@example.invalid")
            git(root, "config", "user.name", "Fixture")
            (root / "source.txt").write_text("source\n", encoding="utf-8")
            git(root, "add", "source.txt")
            git(root, "commit", "-qm", "initial source")
            git(root, "worktree", "add", "-qb", "fixture-linked", str(worktree))

            commit_path = Path(git(worktree, "rev-parse", "--git-path", "COMMIT_EDITMSG"))
            pr_path = Path(git(worktree, "rev-parse", "--git-path", "PR_DESCRIPTION.md"))
            self.assertTrue(commit_path.is_absolute())
            self.assertTrue(pr_path.is_absolute())
            self.assertIn("worktrees", commit_path.parts)
            commit_path.write_text(VALID_COMMIT, encoding="utf-8")
            pr_path.write_text(VALID_PR, encoding="utf-8")

            commit_result, commit_payload = self.run_checker("commit-message", cwd=worktree)
            pr_result, pr_payload = self.run_checker("pr-description", cwd=worktree)
        self.assertEqual(commit_result.returncode, 0, commit_payload)
        self.assertEqual(pr_result.returncode, 0, pr_payload)

    def test_pr_environment_path_supports_thin_provider_integrations(self) -> None:
        """Allow a host to bind the exact provider body without adding provider logic to the wheel."""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "provider-body.md"
            path.write_text(VALID_PR, encoding="utf-8")
            result, payload = self.run_checker(
                "pr-description",
                cwd=Path(directory),
                environment={"PROJECT_GOVERNANCE_PR_BODY_FILE": str(path)},
            )
        self.assertEqual(result.returncode, 0, payload)

    def test_pr_pack_is_always_selected_at_local_and_ci_boundaries(self) -> None:
        """Select PR structure even when no changed file owns a validation concern."""
        packs = load_packs(ROOT / "tests/fixtures/empty-target")
        for stage in ("pre-pr", "ci-pr"):
            with self.subTest(stage=stage):
                plan = build_plan(
                    packs,
                    stage=stage,
                    mode="impacted",
                    changed_paths=[],
                )
                self.assertEqual(plan["status"], "ready", plan)
                self.assertEqual(plan["selected_packs"], ["pr-description"])
                self.assertEqual(
                    plan["selection_reasons"]["pr-description"],
                    ["run_when:always"],
                )

    def test_pr_pack_forwards_the_exact_body_path_without_a_shell(self) -> None:
        """Use the existing argv contract rather than interpolating PR content into a command."""
        packs = load_packs(ROOT / "tests/fixtures/empty-target")
        body_path = "/tmp/body with spaces.md"
        argv = command_argv(
            packs["pr-description"]["commands"][0],
            stage="pre-pr",
            mode="impacted",
            command_arguments={"pr_body_file": body_path},
        )
        self.assertEqual(
            argv,
            [
                sys.executable,
                "-m",
                "project_governance_runtime.checkers",
                "pr-description",
                body_path,
            ],
        )

    def test_github_workflow_binds_the_live_body_as_environment_data(self) -> None:
        """Run on body and scope changes without interpolating untrusted PR text into shell code."""
        workflow_path = ROOT / ".github/workflows/pr-description.yml"
        workflow_text = workflow_path.read_text(encoding="utf-8")
        workflow = yaml.load(workflow_text, Loader=yaml.BaseLoader)
        self.assertEqual(
            workflow["on"]["pull_request"]["types"],
            ["opened", "edited", "synchronize", "reopened", "ready_for_review"],
        )
        job = workflow["jobs"]["pr-description"]
        self.assertEqual(job["if"], "github.event.pull_request.draft == false")
        checkout = next(step for step in job["steps"] if "uses" in step)
        self.assertEqual(
            checkout["with"]["ref"],
            "${{ github.event.pull_request.base.sha }}",
        )
        materialize = next(
            step for step in job["steps"] if step.get("name") == "Materialize the live pull request body"
        )
        self.assertEqual(materialize["env"]["PR_BODY"], "${{ github.event.pull_request.body }}")
        self.assertNotIn("github.event.pull_request.body", materialize["run"])
        validate = next(
            step for step in job["steps"] if step.get("name") == "Validate the change narrative"
        )
        self.assertIn("project_governance_runtime.checkers pr-description", validate["run"])


if __name__ == "__main__":
    unittest.main()
