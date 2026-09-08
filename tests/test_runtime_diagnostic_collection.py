"""Prove one run collects independent failures without weakening execution boundaries."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from test_runtime_package_execution import all_change_scope
from project_governance_runtime.cli import _result_summary
from project_governance_runtime.runner import execute


class DiagnosticCollectionTests(unittest.TestCase):
    """Exercise actual child processes, prerequisite skips, and shared packet identity."""

    def _pack(self, *, fail=False, exit_code=0, dependencies=(), script=None, enforcement="blocking"):
        """Build a checker that records its shared packet before emitting a verdict."""
        findings = [{"rule_id": "test.failure", "severity": "blocking", "message": "repair me"}] if fail else []
        envelope = {"status": "failed" if fail else "passed", "findings": findings}
        command = script or (
            "import os,json; from pathlib import Path; "
            "Path(os.environ['PROJECT_GOVERNANCE_PACK_ID']+'.packet').write_text(os.environ['PROJECT_GOVERNANCE_CHANGE_PACKET']); "
            f"print({json.dumps(envelope)!r}); raise SystemExit({exit_code})"
        )
        return {"enforcement": enforcement, "depends_on": list(dependencies), "commands": [[sys.executable, "-c", command]]}

    def _run(self, packs, timeout=2):
        """Run one prepared selection and capture its externally observable execution set."""
        plan = {"stage": "pre-commit", "mode": "impacted", "changed_paths": [],
                "change_scope": all_change_scope(), "selected_packs": list(packs), "execution_order": list(packs)}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result = execute(root, packs, plan, timeout_seconds=timeout)
            identities = [path.read_text() for path in root.glob('*.packet')]
            telemetry = [json.loads(line) for line in (root / '.governance/telemetry/runs.jsonl').read_text().splitlines()]
        return result, identities, telemetry

    def test_independent_failures_share_one_packet_and_one_run(self):
        """Retain every independent finding after both exit-zero and exit-one failures."""
        packs = {"first": self._pack(fail=True, exit_code=1), "second": self._pack(fail=True), "third": self._pack()}
        result, identities, telemetry = self._run(packs)
        self.assertEqual(result['status'], 'failed')
        self.assertEqual([item['pack_id'] for item in result['evidence']], list(packs))
        self.assertEqual(len(identities), 3)
        self.assertEqual(len(set(identities)), 1)
        self.assertEqual([row['event'] for row in telemetry], ['run-started', 'run-terminal'])
        self.assertEqual(telemetry[-1]['failed_pack_ids'], ['first', 'second'])

    def test_failed_prerequisites_block_only_their_descendants(self):
        """Skip failed prerequisite chains while executing independent later checks."""
        packs = {'first': self._pack(fail=True), 'dependent': self._pack(dependencies=['first']),
                 'transitive': self._pack(dependencies=['dependent']), 'independent': self._pack()}
        result, identities, _ = self._run(packs)
        self.assertEqual(result['status'], 'failed')
        self.assertEqual([item['pack_id'] for item in result['evidence']], ['first', 'independent'])
        self.assertEqual(result['blocked_packs'], {'dependent': ['first'], 'transitive': ['dependent']})
        self.assertEqual(_result_summary(result)['blocked_packs'], result['blocked_packs'])
        self.assertEqual(len(identities), 2)

    def test_execution_and_integrity_failures_still_stop(self):
        """Do not continue after malformed output, abnormal exit, cancellation, or tampering."""
        cases = {
            'empty': 'raise SystemExit(1)',
            'malformed': "print('not JSON')",
            'bad_status': "print('{\"status\":\"unknown\",\"findings\":[]}')",
            'signal': 'import os,signal; os.kill(os.getpid(), signal.SIGTERM)',
            'abnormal_exit': "print('{\"status\":\"failed\",\"findings\":[\"bad\"]}'); raise SystemExit(2)",
            'packet': "import os; from pathlib import Path; p=Path(os.environ['PROJECT_GOVERNANCE_CHANGE_PACKET']); p.chmod(0o600); p.write_text('{}'); print('{\"status\":\"passed\",\"findings\":[]}')",
            'manifest': "import os; from pathlib import Path; Path(os.environ['PROJECT_GOVERNANCE_EVIDENCE_ROOT'], 'evidence-manifest.json').write_text('{}'); print('{\"status\":\"passed\",\"findings\":[]}')",
        }
        for label, script in cases.items():
            with self.subTest(label=label):
                result, _, _ = self._run({'first': self._pack(script=script), 'later': self._pack()})
                self.assertEqual(result['status'], 'failed')
                self.assertEqual([item['pack_id'] for item in result['evidence']], ['first'])

    def test_timeout_still_stops(self):
        """A timed-out process cannot be treated as a recoverable diagnostic verdict."""
        result, _, _ = self._run({'first': self._pack(script='import time; time.sleep(10)'), 'later': self._pack()}, timeout=0.05)
        self.assertEqual(result['termination_reason'], 'timeout')
        self.assertEqual([item['pack_id'] for item in result['evidence']], ['first'])

    def test_advisory_exit_one_remains_blocking(self):
        """Continuing diagnostics never downgrades a nonzero advisory command exit."""
        result, _, _ = self._run({'first': self._pack(fail=True, exit_code=1, enforcement='advisory'), 'later': self._pack()})
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(len(result['evidence']), 2)

    def test_blocking_dependent_of_failed_advisory_cannot_pass(self):
        """A skipped blocking prerequisite consumer prevents a warning-only result."""
        result, _, _ = self._run({'first': self._pack(fail=True, enforcement='advisory'), 'later': self._pack(dependencies=['first'])})
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['blocked_packs'], {'later': ['first']})
