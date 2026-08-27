#!/usr/bin/env python3
"""Prove bounded execution, normalized evidence, and local telemetry."""

from __future__ import annotations

import hashlib
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from project_governance_runtime.processes import run_command  # noqa: E402
from project_governance_runtime.changed_paths import (  # noqa: E402
    resolve_change_scope,
    subject_digest,
)
from project_governance_runtime.execution_commands import command_argv  # noqa: E402
from project_governance_runtime.execution_flow import execution_environment  # noqa: E402
from project_governance_runtime.cli import _result_summary  # noqa: E402
from project_governance_runtime.planning import build_plan  # noqa: E402
from project_governance_runtime.runner import _telemetry_identity, execute  # noqa: E402
from project_governance_runtime.telemetry import status as telemetry_status  # noqa: E402


def all_change_scope() -> dict[str, object]:
    """Return the explicit full-repository packet used by execution-only tests."""
    return {
        "kind": "project-governance-change-packet",
        "version": 1,
        "scope": "all",
        "mode": "all",
        "base_ref": None,
        "records": [],
    }


def empty_changed_scope() -> dict[str, object]:
    """Return one content-bound empty changed subject for execution-only evidence tests."""
    records: list[dict[str, object]] = []
    return {
        "kind": "project-governance-change-packet",
        "version": 1,
        "scope": "changed",
        "mode": "explicit",
        "base_ref": None,
        "records": records,
        "subject_digest": subject_digest(records),
    }


class RuntimeExecutionTests(unittest.TestCase):
    """Keep execution shell-free, bounded, and evidence-producing."""

    def test_absent_timeout_leaves_duration_to_the_target(self) -> None:
        """Complete normally when neither the target nor operator supplies a deadline."""
        with tempfile.TemporaryDirectory() as directory:
            result = run_command(
                [sys.executable, "-c", "import time; time.sleep(0.02)"],
                root=Path(directory),
                timeout_seconds=None,
                environment={},
            )
        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.termination_reason, "completed")

    def test_timeout_terminates_the_owned_process(self) -> None:
        """Return the stable timeout code instead of leaving a child alive."""
        with tempfile.TemporaryDirectory() as directory:
            result = run_command(
                [sys.executable, "-c", "import time; time.sleep(5)"],
                root=Path(directory),
                timeout_seconds=0.05,
                environment={},
            )
        self.assertEqual(result.exit_code, 124)
        self.assertEqual(result.termination_reason, "timeout")

    def test_timeout_cleans_up_a_spawned_child(self) -> None:
        """Terminate descendants with the owned process group, not just their parent."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pid_path = root / "child.pid"
            script = (
                "import pathlib,subprocess,time; "
                "child=subprocess.Popen(['sleep','30']); "
                f"pathlib.Path({str(pid_path)!r}).write_text(str(child.pid)); "
                "time.sleep(30)"
            )
            result = run_command(
                [sys.executable, "-c", script],
                root=root,
                timeout_seconds=0.2,
                environment=dict(os.environ),
            )
            child_pid = int(pid_path.read_text(encoding="utf-8"))
            with self.assertRaises(ProcessLookupError):
                os.kill(child_pid, 0)
        self.assertEqual(result.termination_reason, "timeout")

    def test_interrupt_returns_the_stable_cancelled_result(self) -> None:
        """Convert an operator interrupt into code 130 after child cleanup."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            ready = root / "ready"
            child = (
                "from pathlib import Path; import time; "
                f"Path({str(ready)!r}).write_text('ready'); "
                "time.sleep(30)"
            )
            program = (
                "from pathlib import Path; import os,sys; "
                f"sys.path.insert(0,{str(ROOT / 'src')!r}); "
                "from project_governance_runtime.processes import run_command; "
                f"result=run_command([sys.executable,'-c',{child!r}],"
                f"root=Path({str(root)!r}),timeout_seconds=40,environment=dict(os.environ)); "
                "print(result.exit_code,result.termination_reason)"
            )
            process = subprocess.Popen(
                [sys.executable, "-c", program],
                cwd=root,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            deadline = time.monotonic() + 2
            while not ready.exists() and time.monotonic() < deadline:
                time.sleep(0.01)
            self.assertTrue(ready.exists())
            process.send_signal(signal.SIGINT)
            stdout, stderr = process.communicate(timeout=3)
        self.assertEqual(process.returncode, 0, stderr)
        self.assertEqual(stdout.strip(), "130 cancelled")

    def test_target_command_is_normalized_and_recorded(self) -> None:
        """Retain a child pack's structured findings, run identity, and telemetry."""
        payload = json.dumps({"status": "passed", "finding_count": 0, "findings": []})
        packs = {
            "target-check": {
                "enforcement": "blocking",
                "commands": [[sys.executable, "-c", f"print({payload!r})"]],
            }
        }
        plan = {
            "stage": None,
            "mode": "explicit",
            "changed_paths": [],
            "change_scope": all_change_scope(),
            "selected_packs": ["target-check"],
            "execution_order": ["target-check"],
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = execute(root, packs, plan, timeout_seconds=2)
            records = [
                json.loads(line)
                for line in (root / ".governance/telemetry/runs.jsonl")
                .read_text(encoding="utf-8")
                .splitlines()
            ]
            summary = _result_summary(output)
            rendered_summary = json.dumps(summary, sort_keys=True)
        self.assertEqual(output["status"], "passed")
        self.assertEqual(output["run_id"], records[0]["run_id"])
        self.assertEqual(output["run_id"], records[-1]["run_id"])
        self.assertEqual(records[0]["event"], "run-started")
        self.assertEqual(records[-1]["event"], "run-terminal")
        self.assertEqual(records[0]["changed_path_count"], 0)
        self.assertEqual(records[0]["selected_pack_count"], 1)
        self.assertEqual(records[-1]["changed_path_count"], 0)
        self.assertEqual(records[-1]["selected_pack_count"], 1)
        self.assertEqual(records[-1]["packs"][0]["id"], "target-check")
        self.assertGreaterEqual(records[-1]["packs"][0]["duration_ms"], 0)
        self.assertNotIn(payload, rendered_summary)
        self.assertNotIn("stdout", rendered_summary)
        self.assertNotIn("argv", rendered_summary)
        self.assertNotIn("nonpassing_packs", summary)
        self.assertNotIn("commands", records[-1]["packs"][0])
        self.assertNotIn("stdout", records[-1]["packs"][0])
        self.assertNotIn("paths", records[-1])
        self.assertNotIn("content", records[-1])
        self.assertNotIn("queue_duration", records[-1])
        self.assertIsNone(output["subject_digest"])
        self.assertNotIn("subject_digest", records[0])
        self.assertNotIn("subject_digest", records[-1])
        self.assertEqual(output["evidence"][0]["evidence_manifest"]["status"], "absent")
        self.assertEqual(
            set(records[-1]["packs"][0]), {"id", "duration_ms"}
        )

    def test_compact_failure_retains_bounded_normalized_findings(self) -> None:
        """Make a compact failure actionable without copying arbitrary process output."""
        output = {
            "run_id": "run-1",
            "status": "failed",
            "termination_reason": "exit",
            "duration_ms": 12,
            "subject_digest": "sha256:" + "a" * 64,
            "plan": {
                "status": "ready",
                "stage": "pre-push",
                "mode": "impacted",
                "changed_paths": ["private/source.py"],
                "selected_packs": ["tests"],
                "execution_order": ["tests"],
            },
            "evidence": [{
                "pack_id": "tests",
                "status": "failed",
                "duration_ms": 10,
                "finding_count": 1,
                "finding_counts": {"blocking": 1},
                "process_failure_count": 1,
                "integrity_failure_count": 0,
                "evidence_manifest_count": 0,
                "valid_evidence_manifest_count": 0,
                "invalid_evidence_manifest_count": 0,
                "findings": [],
                "commands": [{
                    "argv": ["private-tool"],
                    "stdout": "private output",
                    "stderr": "private error",
                    "findings": [{
                        "rule_id": "checker.command-failed",
                        "severity": "blocking",
                        "message": "x" * 1200,
                    }],
                }],
            }],
        }
        summary = _result_summary(output)
        rendered = json.dumps(summary, sort_keys=True)
        self.assertEqual(summary["nonpassing_packs"][0]["pack_id"], "tests")
        self.assertEqual(
            summary["nonpassing_packs"][0]["finding_counts"], {"blocking": 1}
        )
        self.assertEqual(summary["findings"][0]["pack_id"], "tests")
        self.assertTrue(summary["findings"][0]["message_truncated"])
        self.assertEqual(len(summary["findings"][0]["message"]), 1000)
        self.assertNotIn("private/source.py", rendered)
        self.assertNotIn("private-tool", rendered)
        self.assertNotIn("private output", rendered)
        self.assertNotIn("private error", rendered)

    def test_valid_pack_evidence_manifest_is_digest_indexed(self) -> None:
        """Index bounded claims without copying claim IDs or artifact data into telemetry."""
        child = (
            "import json,os,pathlib; "
            "root=pathlib.Path(os.environ['PROJECT_GOVERNANCE_EVIDENCE_ROOT']); "
            "manifest={'kind':'project-governance-evidence-manifest','version':1,"
            "'subject_digest':os.environ['PROJECT_GOVERNANCE_SUBJECT_DIGEST'],"
            "'claims':[{'id':'target.behavior','outcome':'passed',"
            "'artifact_digests':['sha256:'+'2'*64]}]}; "
            "(root/'evidence-manifest.json').write_text(json.dumps(manifest)); "
            "print(json.dumps({'status':'passed','finding_count':0,'findings':[]}))"
        )
        packs = {
            "target-check": {
                "enforcement": "blocking",
                "commands": [[sys.executable, "-c", child]],
            }
        }
        plan = {
            "stage": None,
            "mode": "explicit",
            "changed_paths": [],
            "change_scope": empty_changed_scope(),
            "selected_packs": ["target-check"],
            "execution_order": ["target-check"],
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = execute(root, packs, plan, timeout_seconds=2)
            retained_root = (
                root
                / ".governance/runtime/runs"
                / output["run_id"]
                / "target-check"
            )
            self.assertTrue((retained_root / "evidence-manifest.json").is_file())
            telemetry = (
                root / ".governance/telemetry/runs.jsonl"
            ).read_text(encoding="utf-8")
            terminal = json.loads(telemetry.splitlines()[-1])

        item = output["evidence"][0]
        self.assertEqual(output["status"], "passed")
        self.assertEqual(item["evidence_manifest"]["status"], "valid")
        self.assertRegex(
            item["evidence_manifest"]["manifest_digest"],
            r"^sha256:[0-9a-f]{64}$",
        )
        self.assertEqual(item["evidence_claim_count"], 1)
        self.assertEqual(item["evidence_artifact_digest_count"], 1)
        self.assertEqual(item["process_failure_count"], 0)
        self.assertEqual(terminal["packs"][0]["id"], "target-check")
        self.assertNotIn("target.behavior", telemetry)
        self.assertNotIn("22222222", telemetry)

    def test_inactive_findings_do_not_keep_the_run_in_warning(self) -> None:
        """Retain reviewed findings while restoring signal for new active warnings."""
        payload = json.dumps({
            "status": "warning",
            "findings": [
                {"rule_id": "review.accepted", "severity": "accepted"},
                {"rule_id": "review.waived", "severity": "waived"},
                {"rule_id": "review.suppressed", "severity": "suppressed"},
            ],
        })
        packs = {
            "target-check": {
                "enforcement": "blocking",
                "commands": [[sys.executable, "-c", f"print({payload!r})"]],
            }
        }
        plan = {
            "stage": None,
            "mode": "explicit",
            "changed_paths": [],
            "change_scope": all_change_scope(),
            "selected_packs": ["target-check"],
            "execution_order": ["target-check"],
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = execute(root, packs, plan, timeout_seconds=2)
            terminal = json.loads(
                (root / ".governance/telemetry/runs.jsonl")
                .read_text(encoding="utf-8")
                .splitlines()[-1]
            )

        self.assertEqual(output["status"], "passed")
        item = output["evidence"][0]
        self.assertEqual(item["status"], "passed")
        self.assertEqual(item["finding_count"], 3)
        self.assertEqual(set(terminal["packs"][0]), {"id", "duration_ms"})

    def test_advisory_pack_runtime_integrity_failures_still_fail_the_run(self) -> None:
        """Keep pack enforcement from downgrading process and envelope integrity."""
        cases = {
            "nonzero": ((
                "import json; print(json.dumps({'status':'passed','findings':[]})); "
                "raise SystemExit(7)"
            ), 1, 0),
            "malformed": ("print('ordinary tool output')", 0, 1),
            "unknown-severity": ((
                "import json; print(json.dumps({'status':'passed','findings':"
                "[{'rule_id':'bad.state','severity':'ignored'}]}))"
            ), 0, 1),
            "timeout": ("import time; time.sleep(2)", 1, 0),
        }
        for label, (script, process_failures, integrity_failures) in cases.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as directory:
                packs = {
                    "advisory-target": {
                        "enforcement": "advisory",
                        "commands": [[sys.executable, "-c", script]],
                    }
                }
                plan = {
                    "stage": None,
                    "mode": "explicit",
                    "changed_paths": [],
                    "change_scope": all_change_scope(),
                    "selected_packs": ["advisory-target"],
                    "execution_order": ["advisory-target"],
                }
                output = execute(Path(directory), packs, plan, timeout_seconds=0.05)

            self.assertEqual(output["status"], "failed")
            self.assertEqual(
                output["evidence"][0]["process_failure_count"], process_failures
            )
            self.assertEqual(
                output["evidence"][0]["integrity_failure_count"], integrity_failures
            )

    def test_command_cannot_persistently_change_packet_materializations(self) -> None:
        """Fail the run when one command rewrites bytes shared with later checkers."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "sample.py"
            source.write_text("planned\n", encoding="utf-8")
            identity = "sha256:" + hashlib.sha256(source.read_bytes()).hexdigest()
            records = [{
                "status": "added",
                "path": "sample.py",
                "previous_path": None,
                "before": None,
                "after": {
                    "kind": "worktree",
                    "path": "sample.py",
                    "identity": identity,
                },
                "changed_ranges": [{"start": 1, "end": 1}],
            }]
            scope = {
                "kind": "project-governance-change-packet",
                "version": 1,
                "scope": "changed",
                "mode": "explicit",
                "base_ref": None,
                "records": records,
                "subject_digest": subject_digest(records),
            }
            child = (
                "import json,os,pathlib; "
                "packet=json.loads(pathlib.Path(os.environ['PROJECT_GOVERNANCE_CHANGE_PACKET']).read_text()); "
                "after=pathlib.Path(packet['records'][0]['after_path']); "
                "after.chmod(0o600); after.write_text('tampered\\n'); "
                "print(json.dumps({'status':'passed','findings':[]}))"
            )
            packs = {
                "target-check": {
                    "enforcement": "blocking",
                    "commands": [[sys.executable, "-c", child]],
                }
            }
            plan = {
                "stage": None,
                "mode": "explicit",
                "changed_paths": ["sample.py"],
                "change_scope": scope,
                "selected_packs": ["target-check"],
                "execution_order": ["target-check"],
            }
            output = execute(root, packs, plan, timeout_seconds=2)

        self.assertEqual(output["status"], "failed")
        command = output["evidence"][0]["commands"][0]
        self.assertTrue(command["integrity_failure"])
        self.assertEqual(command["findings"][-1]["rule_id"], "packet.materialization-changed")

    def test_later_stage_secret_surface_has_no_changed_only_digest(self) -> None:
        """Mark the deliberate live exhaustive secret surface honestly per pack."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", "-b", "main"], cwd=root, check=True)
            subprocess.run(
                ["git", "config", "user.email", "runtime@example.invalid"],
                cwd=root,
                check=True,
            )
            subprocess.run(
                ["git", "config", "user.name", "Runtime Tests"], cwd=root, check=True
            )
            (root / "baseline.txt").write_text("safe\n", encoding="utf-8")
            subprocess.run(["git", "add", "baseline.txt"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-qm", "baseline"], cwd=root, check=True)
            packs = {
                "secrets": {
                    "enforcement": "blocking",
                    "commands": [{"builtin": "secrets"}],
                }
            }
            plan = {
                "stage": "pre-pr",
                "mode": "impacted",
                "changed_paths": [],
                "change_scope": empty_changed_scope(),
                "selected_packs": ["secrets"],
                "execution_order": ["secrets"],
            }
            with patch.dict(
                os.environ, {"PYTHONPATH": str(ROOT / "src")}, clear=False
            ):
                output = execute(root, packs, plan, timeout_seconds=5)

        self.assertRegex(output["subject_digest"], r"^sha256:")
        item = output["evidence"][0]
        self.assertEqual(item["status"], "passed")
        self.assertIsNone(item["subject_digest"])
        self.assertEqual(item["commands"][0]["argv"][-1], "--all")

    def test_invalid_manifest_blocks_even_when_pack_is_advisory(self) -> None:
        """Treat pack-local evidence integrity as runtime-owned, not pack enforcement."""
        child = (
            "import json,os,pathlib; "
            "root=pathlib.Path(os.environ['PROJECT_GOVERNANCE_EVIDENCE_ROOT']); "
            "manifest={'kind':'project-governance-evidence-manifest','version':1,"
            "'subject_digest':'sha256:'+'0'*64,'claims':[]}; "
            "(root/'evidence-manifest.json').write_text(json.dumps(manifest)); "
            "print(json.dumps({'status':'passed','finding_count':0,'findings':[]}))"
        )
        packs = {
            "advisory-target": {
                "enforcement": "advisory",
                "commands": [[sys.executable, "-c", child]],
            },
            "later": {
                "enforcement": "blocking",
                "commands": [[sys.executable, "-c", "raise SystemExit(0)"]],
            },
        }
        plan = {
            "stage": None,
            "mode": "explicit",
            "changed_paths": [],
            "change_scope": empty_changed_scope(),
            "selected_packs": ["advisory-target", "later"],
            "execution_order": ["advisory-target", "later"],
        }
        with tempfile.TemporaryDirectory() as directory:
            output = execute(Path(directory), packs, plan, timeout_seconds=2)

        self.assertEqual(output["status"], "failed")
        self.assertEqual([item["pack_id"] for item in output["evidence"]], ["advisory-target"])
        item = output["evidence"][0]
        self.assertEqual(item["evidence_manifest"]["status"], "invalid")
        self.assertEqual(item["finding_counts"]["blocking"], 1)
        self.assertEqual(item["findings"][0]["pack_id"], "advisory-target")

    def test_materialization_exception_records_terminal_and_reraises(self) -> None:
        """Close the lifecycle without persisting exception text or changing the error."""
        self._assert_runtime_exception_receipt("execution_environment")

    def test_orchestrator_exception_records_terminal_and_reraises(self) -> None:
        """Close the lifecycle when orchestration fails after materialization."""
        self._assert_runtime_exception_receipt("execute_packs")

    def _assert_runtime_exception_receipt(self, failing_call: str) -> None:
        plan = {
            "stage": "pre-commit",
            "mode": "impacted",
            "changed_paths": ["private/source.py"],
            "change_scope": all_change_scope(),
            "selected_packs": ["target-check"],
            "execution_order": ["target-check"],
        }
        error = RuntimeError("private packet or orchestrator detail")

        @contextmanager
        def prepared_environment():
            yield {}

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            if failing_call == "execution_environment":
                patches = (
                    patch(
                        "project_governance_runtime.runner.execution_environment",
                        side_effect=error,
                    ),
                    patch("project_governance_runtime.runner.execute_packs"),
                )
            else:
                patches = (
                    patch(
                        "project_governance_runtime.runner.execution_environment",
                        return_value=prepared_environment(),
                    ),
                    patch(
                        "project_governance_runtime.runner.execute_packs",
                        side_effect=error,
                    ),
                )
            with patches[0], patches[1], self.assertRaises(RuntimeError) as raised:
                execute(root, {}, plan, timeout_seconds=2)
            records_text = (root / ".governance/telemetry/runs.jsonl").read_text(
                encoding="utf-8"
            )
            records = [json.loads(line) for line in records_text.splitlines()]

        self.assertIs(raised.exception, error)
        self.assertEqual([record["event"] for record in records], ["run-started", "run-terminal"])
        self.assertEqual(records[0]["run_id"], records[1]["run_id"])
        self.assertEqual(records[1]["status"], "failed")
        self.assertEqual(records[1]["termination_reason"], "runtime-exception")
        self.assertNotIn("packs", records[1])
        self.assertNotIn("private packet", records_text)

    def test_each_pack_receives_one_run_scoped_evidence_root(self) -> None:
        """Keep sequential evidence writers in distinct directories within one run."""
        child = (
            "import json,os; "
            "print(json.dumps({'status':'passed','finding_count':0,'findings':[],"
            "'run_id':os.environ['PROJECT_GOVERNANCE_RUN_ID'],"
            "'pack_id':os.environ['PROJECT_GOVERNANCE_PACK_ID'],"
            "'evidence_root':os.environ['PROJECT_GOVERNANCE_EVIDENCE_ROOT'],"
            "'evidence_root_exists':os.path.isdir("
            "os.environ['PROJECT_GOVERNANCE_EVIDENCE_ROOT'])}))"
        )
        packs = {
            pack_id: {
                "enforcement": "blocking",
                "commands": [[sys.executable, "-c", child]],
            }
            for pack_id in ("first", "second", "../outside-run")
        }
        plan = {
            "stage": None,
            "mode": "explicit",
            "changed_paths": [],
            "change_scope": all_change_scope(),
            "selected_packs": ["first", "second", "../outside-run"],
            "execution_order": ["first", "second", "../outside-run"],
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stale = root / ".governance/runtime/runs/stale/pack"
            stale.mkdir(parents=True)
            retained = root / ".governance/runtime/runs/retained/pack"
            retained.mkdir(parents=True)
            (retained / "evidence.txt").write_text("target-owned\n", encoding="utf-8")
            active = root / ".governance/runtime/runs/active"
            (active / "pack").mkdir(parents=True)
            (active / ".active").touch()
            output = execute(root, packs, plan, timeout_seconds=2)
            child_outputs = [
                json.loads(item["commands"][0]["stdout"])
                for item in output["evidence"]
            ]
            evidence_roots = [Path(item["evidence_root"]) for item in child_outputs]
            self.assertTrue(all(item["evidence_root_exists"] for item in child_outputs))
            self.assertTrue(all(not path.exists() for path in evidence_roots))
            self.assertFalse(
                (root / ".governance/runtime/runs" / output["run_id"]).exists()
            )
            self.assertFalse(stale.parent.exists())
            self.assertEqual((retained / "evidence.txt").read_text(), "target-owned\n")
            self.assertTrue((active / "pack").is_dir())
        self.assertEqual({item["run_id"] for item in child_outputs}, {output["run_id"]})
        self.assertEqual(
            [item["pack_id"] for item in child_outputs],
            ["first", "second", "../outside-run"],
        )
        self.assertEqual(len(set(evidence_roots)), 3)
        self.assertTrue(all(path.parent.name == output["run_id"] for path in evidence_roots))
        self.assertEqual(
            [path.parts[-2:] for path in evidence_roots[:2]],
            [
                (output["run_id"], "first"),
                (output["run_id"], "second"),
            ],
        )
        self.assertTrue(evidence_roots[-1].name.startswith("pack-"))

    def test_nested_execution_setup_cannot_prune_an_active_run(self) -> None:
        """Serialize only run-marker maintenance while validations remain independent."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan = {"change_scope": all_change_scope()}
            runs_root = root / ".governance/runtime/runs"
            with execution_environment(root, plan, run_id="outer"):
                outer = runs_root / "outer"
                self.assertTrue((outer / ".active").is_file())
                with execution_environment(root, plan, run_id="inner"):
                    self.assertTrue((outer / ".active").is_file())
                    self.assertTrue((runs_root / "inner/.active").is_file())
                self.assertTrue((outer / ".active").is_file())
                self.assertFalse((runs_root / "inner").exists())
            self.assertFalse(runs_root.exists())

    def test_target_child_reads_the_staged_after_image_from_the_packet(self) -> None:
        """Prove a replacement command can analyze index bytes instead of dirty worktree bytes."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", "-b", "main"], cwd=root, check=True)
            subprocess.run(
                ["git", "config", "user.email", "runtime@example.invalid"],
                cwd=root,
                check=True,
            )
            subprocess.run(
                ["git", "config", "user.name", "Runtime Tests"], cwd=root, check=True
            )
            source = root / "sample.txt"
            source.write_text("baseline\n", encoding="utf-8")
            subprocess.run(["git", "add", source.name], cwd=root, check=True)
            subprocess.run(["git", "commit", "-qm", "baseline"], cwd=root, check=True)
            source.write_text("staged marker\n", encoding="utf-8")
            subprocess.run(["git", "add", source.name], cwd=root, check=True)
            source.write_text("working marker\n", encoding="utf-8")
            scope = resolve_change_scope(root, staged=True)
            child = (
                "import json,os,pathlib; "
                "packet=json.loads(pathlib.Path(os.environ['PROJECT_GOVERNANCE_CHANGE_PACKET']).read_text()); "
                "content=pathlib.Path(packet['records'][0]['after_path']).read_text(); "
                "ok=content == 'staged marker\\n'; "
                "print(json.dumps({'status':'passed' if ok else 'failed','finding_count':0 if ok else 1,'findings':[]})); "
                "raise SystemExit(0 if ok else 1)"
            )
            packs = {
                "target-check": {
                    "enforcement": "blocking",
                    "commands": [[sys.executable, "-c", child]],
                }
            }
            plan = {
                "stage": "pre-commit",
                "mode": "impacted",
                "changed_paths": [source.name],
                "change_scope": scope,
                "selected_packs": ["target-check"],
                "execution_order": ["target-check"],
            }
            output = execute(root, packs, plan, timeout_seconds=2)
        self.assertEqual(output["status"], "passed", output)
        self.assertEqual(output["subject_digest"], scope["subject_digest"])

    def test_replacement_executes_once_and_builtin_does_not_execute(self) -> None:
        """Carry one explicit ownership transfer from planning through execution."""
        passed = json.dumps({"status": "passed", "finding_count": 0, "findings": []})
        packs = {
            "generic": {
                "implementation_status": "active",
                "enforcement": "blocking",
                "stages": ["pre-commit"],
                "path_globs": ["src/**"],
                "commands": [[sys.executable, "-c", "raise SystemExit(9)"]],
            },
            "target": {
                "implementation_status": "active",
                "enforcement": "blocking",
                "stages": ["pre-commit"],
                "path_globs": ["src/**"],
                "commands": [[sys.executable, "-c", f"print({passed!r})"]],
                "replaces_builtin_packs": ["generic"],
                "change_packet_contract": 1,
            },
        }
        plan = build_plan(
            packs,
            stage="pre-commit",
            mode="all",
            changed_paths=[],
        )
        plan["change_scope"] = all_change_scope()
        with tempfile.TemporaryDirectory() as directory:
            output = execute(Path(directory), packs, plan, timeout_seconds=2)
        self.assertEqual(output["status"], "passed", output)
        self.assertEqual([item["pack_id"] for item in output["evidence"]], ["target"])

    def test_plain_finding_is_normalized_once_at_the_runner_boundary(self) -> None:
        """Let target-owned checkers stay simple without weakening the evidence schema."""
        payload = json.dumps({
            "status": "failed",
            "finding_count": 1,
            "findings": ["project rule failed"],
        })
        packs = {
            "target-check": {
                "enforcement": "blocking",
                "commands": [[sys.executable, "-c", f"print({payload!r}); raise SystemExit(1)"]],
            }
        }
        plan = {
            "stage": None,
            "mode": "explicit",
            "changed_paths": [],
            "change_scope": all_change_scope(),
            "selected_packs": ["target-check"],
            "execution_order": ["target-check"],
        }
        with tempfile.TemporaryDirectory() as directory:
            output = execute(Path(directory), packs, plan, timeout_seconds=2)
        finding = output["evidence"][0]["commands"][0]["findings"][0]
        self.assertEqual(finding["rule_id"], "checker.finding")
        self.assertEqual(finding["severity"], "blocking")
        self.assertEqual(finding["message"], "project rule failed")

    def test_target_pack_argument_is_substituted_as_one_argv_token(self) -> None:
        """Preserve PR lifecycle inputs without shell quoting or split path values."""
        entry = {"run": "python3 scripts/check-pr.py --body-file {pr_body_file}"}
        argv = command_argv(
            entry,
            stage="pre-pr",
            mode="impacted",
            command_arguments={"pr_body_file": "/tmp/body with spaces.md"},
        )
        self.assertEqual(
            argv,
            ["python3", "scripts/check-pr.py", "--body-file", "/tmp/body with spaces.md"],
        )
        self.assertIsNone(
            command_argv(
                entry,
                stage="pre-pr",
                mode="impacted",
                command_arguments={"pr_body_file": ""},
            )
        )

    def test_selected_pack_with_no_resolved_command_fails_closed(self) -> None:
        """Reject a clean pack result when stage or missing arguments omit every command."""
        packs = {
            "target": {
                "enforcement": "blocking",
                "commands": [{"run": "true {pr_body_file}", "stages": ["pre-pr"]}],
            }
        }
        plan = {
            "stage": "pre-pr",
            "mode": "impacted",
            "changed_paths": [],
            "change_scope": all_change_scope(),
            "selected_packs": ["target"],
            "execution_order": ["target"],
        }
        with tempfile.TemporaryDirectory() as directory:
            output = execute(Path(directory), packs, plan, timeout_seconds=2)
        item = output["evidence"][0]
        self.assertEqual(output["status"], "failed")
        self.assertEqual(item["commands"], [])
        self.assertEqual(item["integrity_failure_count"], 0)
        self.assertEqual(item["findings"][0]["rule_id"], "pack.no-applicable-command")

    def test_named_stage_runs_only_its_applicable_pack_command(self) -> None:
        """Execute the named pack without replaying commands from another lifecycle stage."""
        passed = json.dumps({"status": "passed", "finding_count": 0, "findings": []})
        packs = {
            "target": {
                "implementation_status": "active",
                "enforcement": "blocking",
                "stages": ["pre-commit", "pre-push"],
                "path_globs": ["src/**"],
                "depends_on": [],
                "commands": [
                    {
                        "run": [sys.executable, "-c", "raise SystemExit(9)"],
                        "stages": ["pre-commit"],
                    },
                    {
                        "run": [sys.executable, "-c", f"print({passed!r})"],
                        "stages": ["pre-push"],
                    },
                ],
            }
        }
        plan = build_plan(
            packs,
            stage="pre-push",
            mode="impacted",
            changed_paths=["src/example.py"],
            explicit_pack_ids=["target"],
        )
        plan["change_scope"] = all_change_scope()
        with tempfile.TemporaryDirectory() as directory:
            output = execute(Path(directory), packs, plan, timeout_seconds=2)
        self.assertEqual(output["status"], "passed", output)
        self.assertEqual(len(output["evidence"][0]["commands"]), 1)

    def test_advisory_pack_without_a_command_does_not_skip_later_packs(self) -> None:
        """Preserve pack enforcement while preventing an advisory false-green result."""
        passed = json.dumps({"status": "passed", "finding_count": 0, "findings": []})
        packs = {
            "advisory": {
                "enforcement": "advisory",
                "commands": [{"run": "true {pr_body_file}"}],
            },
            "later": {
                "enforcement": "blocking",
                "commands": [[sys.executable, "-c", f"print({passed!r})"]],
            },
        }
        plan = {
            "stage": "pre-pr",
            "mode": "impacted",
            "changed_paths": [],
            "change_scope": all_change_scope(),
            "selected_packs": ["advisory", "later"],
            "execution_order": ["advisory", "later"],
        }
        with tempfile.TemporaryDirectory() as directory:
            output = execute(Path(directory), packs, plan, timeout_seconds=2)
        self.assertEqual(output["status"], "warning")
        self.assertEqual(
            [item["pack_id"] for item in output["evidence"]], ["advisory", "later"]
        )
        self.assertEqual(output["evidence"][0]["findings"][0]["severity"], "advisory")

    def test_blocking_failure_stops_later_packs(self) -> None:
        """Stop dependency-order execution when a blocking pack cannot complete."""
        packs = {
            "first": {
                "enforcement": "blocking",
                "commands": [[sys.executable, "-c", "raise SystemExit(1)"]],
            },
            "later": {
                "enforcement": "blocking",
                "commands": [[sys.executable, "-c", "raise SystemExit(0)"]],
            },
        }
        plan = {
            "stage": None,
            "mode": "explicit",
            "changed_paths": [],
            "change_scope": all_change_scope(),
            "selected_packs": ["first", "later"],
            "execution_order": ["first", "later"],
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = execute(root, packs, plan, timeout_seconds=2)
            terminal = json.loads(
                (root / ".governance/telemetry/runs.jsonl")
                .read_text(encoding="utf-8")
                .splitlines()[-1]
            )
        self.assertEqual(output["status"], "failed")
        self.assertEqual([item["pack_id"] for item in output["evidence"]], ["first"])
        self.assertEqual(terminal["packs"][0]["id"], "first")


class RuntimeTelemetryModeTests(unittest.TestCase):
    """Keep named authoring runs out of broad and repeated-scope observations."""

    def test_named_all_subject_run_is_recorded_as_explicit(self) -> None:
        """Distinguish a named pack from an all-pack release without new receipt state."""
        passed = json.dumps({"status": "passed", "finding_count": 0, "findings": []})
        packs = {
            "target": {
                "enforcement": "blocking",
                "commands": [[sys.executable, "-c", f"print({passed!r})"]],
            }
        }
        named_plan = {
            "stage": "pre-pr",
            "mode": "all",
            "changed_paths": [],
            "change_scope": all_change_scope(),
            "selected_packs": ["target"],
            "selection_reasons": {"target": ["explicit"]},
            "execution_order": ["target"],
        }
        release_plan = {
            **named_plan,
            "stage": "release",
            "selection_reasons": {"target": ["mode:all"]},
        }
        mode, fingerprint = _telemetry_identity(named_plan, "sha256:named")
        self.assertEqual((mode, fingerprint), ("explicit", None))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            execute(root, packs, named_plan, timeout_seconds=2)
            execute(root, packs, named_plan, timeout_seconds=2)
            execute(root, packs, release_plan, timeout_seconds=2)
            summary = telemetry_status(root)["validation"]
        self.assertEqual(summary["mode_counts"], {"all": 1, "explicit": 2})
        self.assertEqual(summary["broad_run_count"], 1)
        self.assertEqual(summary["repeated_scope_run_count"], 0)


if __name__ == "__main__":
    unittest.main()
