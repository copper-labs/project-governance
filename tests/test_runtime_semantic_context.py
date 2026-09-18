"""Exercise optional scoring and complete root-agent delivery without network credentials."""

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml

from project_governance_runtime import context_delivery as delivery, jev
from project_governance_runtime.context import resolve_context
from project_governance_runtime.context_options import options
from test_runtime_context import routing_profile, write_repository


class SemanticContextTests(unittest.TestCase):
    """Protect required bytes and local behavior at the provider and host boundaries."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'AGENTS.md').write_text('Required rules.\n')
        (self.root / 'docs/governance').mkdir(parents=True)
        (self.root / 'docs/governance/guide.md').write_text('Required guide.\n')
        (self.root / 'extra.md').write_text('Extra guidance for cancellation.\n')
        self.profile = routing_profile(context=['AGENTS.md'])
        self.router = self.profile['context_router']
        self.router['default_skills'] = []
        self.router['routes'][0]['expansion_context'] = ['extra.md']
        self.router['delivery'] = {'enabled': True}
        self.router['semantic_selection'] = {'mode': 'on', 'threshold': 0.5,
                                             'allow_task_text': True, 'allow_paths': ['extra.md']}
        write_repository(self.root, self.profile)

    def save(self):
        (self.root / 'config/governance/profile.yaml').write_text(yaml.safe_dump(self.profile))

    def resolve(self, **kwargs):
        return resolve_context(self.root, 'governance', [], **kwargs)

    def ready(self):
        return patch.object(jev, 'readiness', return_value={'status': 'ready'})

    def test_off_is_identical_and_never_checks_credentials(self):
        baseline = self.resolve(semantic_off=True)
        self.router['semantic_selection']['mode'] = 'off'
        self.save()
        with patch.object(jev, 'readiness', side_effect=AssertionError('credentials accessed')):
            self.assertEqual(self.resolve(), baseline)

    def test_on_expands_without_flag_and_preserves_required(self):
        with self.ready(), patch.object(jev, 'evaluate', return_value={'status': 'scored', 'scores': [.9], 'requests': 1}):
            result = self.resolve()
        self.assertEqual(result['semantic_selection']['status'], 'selected')
        self.assertEqual([i['source_path'] for i in result['materialization']['items']],
                         ['AGENTS.md', 'docs/governance/guide.md', 'extra.md'])

    def test_shadow_keeps_baseline(self):
        baseline = self.resolve(semantic_off=True)
        self.router['semantic_selection']['mode'] = 'shadow'
        self.save()
        with self.ready(), patch.object(jev, 'evaluate', return_value={'status': 'scored', 'scores': [.9], 'requests': 1}):
            result = self.resolve()
        self.assertEqual(result['materialization'], baseline['materialization'])

    def test_no_allowlist_no_secret_or_exhausted_budget_egress(self):
        for failure in ('allowlist', 'secret', 'budget'):
            with self.subTest(failure=failure):
                self.router['semantic_selection']['allow_paths'] = [] if failure == 'allowlist' else ['extra.md']
                (self.root / 'extra.md').write_text(('-----BEGIN ' + 'PRIVATE KEY-----') if failure == 'secret' else 'Safe content')
                self.save()
                with self.ready(), patch.object(jev, 'evaluate', side_effect=AssertionError('egress')):
                    result = self.resolve(request_allowance=0 if failure == 'budget' else 48)
                self.assertEqual(result['semantic_selection']['status'], 'fallback')

    def test_changed_source_rejects_scores(self):
        def change(*args):
            (self.root / 'extra.md').write_text('Changed')
            return {'status': 'scored', 'scores': [.9], 'requests': 1}
        with self.ready(), patch.object(jev, 'evaluate', side_effect=change):
            result = self.resolve()
        self.assertEqual(result['semantic_selection']['reason'], 'source-changed')
        self.assertEqual(len(result['materialization']['items']), 2)

    def test_provider_errors_retain_baseline(self):
        baseline = self.resolve(semantic_off=True)
        with self.ready(), patch.object(jev, 'evaluate', return_value={'status': 'fallback', 'reason': 'deadline', 'requests': 1}):
            result = self.resolve()
        self.assertEqual(result['materialization'], baseline['materialization'])

    def test_full_delivery_once_refresh_and_compaction(self):
        self.router['semantic_selection']['mode'] = 'off'
        self.save()
        event = {'hook_event_name': 'UserPromptSubmit', 'session_id': 'one', 'prompt': 'governance'}
        output = delivery.compose(self.root, 'codex', event)
        self.assertIn('Required rules.', output['hookSpecificOutput']['additionalContext'])
        self.assertEqual(delivery.compose(self.root, 'codex', event), {})
        compact = {'hook_event_name': 'SessionStart', 'session_id': 'one', 'source': 'compact'}
        self.assertEqual(delivery.compose(self.root, 'codex', compact)['hookSpecificOutput']['additionalContext'], output['hookSpecificOutput']['additionalContext'])
        (self.root / 'AGENTS.md').write_text('Revised required rules')
        self.assertIn('systemMessage', delivery.compose(self.root, 'codex', compact))
        delivery.refresh(self.root, 'one')
        self.assertIn('Revised required rules', delivery.compose(self.root, 'codex', event)['hookSpecificOutput']['additionalContext'])

    def test_configuration_change_invalidates_retained_packet(self):
        """New mandatory routing policy cannot be hidden behind an older packet."""
        self.router['semantic_selection']['mode'] = 'off'
        self.save()
        event = {'hook_event_name': 'UserPromptSubmit', 'session_id': 'one', 'prompt': 'governance'}
        delivery.compose(self.root, 'codex', event)
        self.router['default_context'].append('new-rules.md')
        self.save()
        self.assertIn('systemMessage', delivery.compose(self.root, 'codex', event))

    def test_subagents_and_off_do_not_resolve(self):
        event = {'hook_event_name': 'UserPromptSubmit', 'session_id': 'one', 'prompt': 'governance', 'agent_id': 'child'}
        with patch.object(delivery, 'resolve_context', side_effect=AssertionError('routed')):
            self.assertEqual(delivery.compose(self.root, 'codex', event), {})
            del event['agent_id']
            self.router['delivery']['enabled'] = False
            self.save()
            self.assertEqual(delivery.compose(self.root, 'codex', event), {})

    def test_delivery_limit_reports_incomplete_without_partial_packet(self):
        self.router['semantic_selection']['mode'] = 'off'
        self.router['delivery']['max_bytes'] = 1
        self.save()
        result = delivery.compose(self.root, 'codex', {'hook_event_name': 'UserPromptSubmit', 'session_id': 'one', 'prompt': 'governance'})
        self.assertIn('systemMessage', result)
        self.assertNotIn('hookSpecificOutput', result)

    def test_enable_preserves_authored_hooks_and_full_text_setting(self):
        path = self.root / '.codex/hooks.json'
        path.parent.mkdir()
        authored = {'hooks': [{'type': 'command', 'command': 'echo user'}]}
        path.write_text(json.dumps({'hooks': {'UserPromptSubmit': [authored]}}))
        delivery.enable(self.root)
        delivery.enable(self.root)
        groups = json.loads(path.read_text())['hooks']['UserPromptSubmit']
        self.assertEqual(groups[0], authored)
        self.assertEqual(len(groups), 2)
        self.assertEqual(groups[1]['hooks'][0]['additionalContextLimit'], 0)

    def test_existing_updater_hook_can_enable_and_disable_context(self):
        """Known updater definitions migrate deliberately without duplicate context handlers."""
        from project_governance_runtime.startup_integration import hook_config
        self.router['delivery']['enabled'] = False
        self.save()
        path, content = hook_config(self.root, 'codex')
        path.parent.mkdir(exist_ok=True)
        path.write_text(content)
        self.router['delivery']['enabled'] = True
        self.save()
        delivery.enable(self.root)
        handler = json.loads(path.read_text())['hooks']['UserPromptSubmit'][0]['hooks'][0]
        self.assertEqual(handler['additionalContextLimit'], 0)
        self.router['delivery']['enabled'] = False
        self.save()
        _, disabled = hook_config(self.root, 'codex')
        self.assertNotIn('additionalContextLimit', json.loads(disabled)['hooks']['UserPromptSubmit'][0]['hooks'][0])

    def test_interruption_keeps_request_reservation(self):
        """A killed resolver cannot erase requests already possibly sent."""
        from project_governance_runtime import context_storage
        event = {'hook_event_name': 'UserPromptSubmit', 'session_id': 'one', 'prompt': 'governance'}
        with patch.object(delivery, 'resolve_context', side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                delivery.compose(self.root, 'codex', event)
        state = context_storage.read(self.root, delivery.session_name('one'))
        self.assertEqual(state['requests'], 12)

    def test_serialized_envelope_bound_includes_escaping(self):
        """A text that fits alone must still fit after JSON escaping."""
        self.router['semantic_selection']['mode'] = 'off'
        self.save()
        with patch.object(delivery, 'render', return_value='"' * 140000):
            output = delivery.compose(self.root, 'codex', {'hook_event_name': 'UserPromptSubmit', 'session_id': 'one', 'prompt': 'governance'})
        self.assertIn('systemMessage', output)
        self.assertNotIn('hookSpecificOutput', output)

    def test_session_end_retires_receipt(self):
        """Closed sessions release bounded inventory without resetting active tasks."""
        self.router['semantic_selection']['mode'] = 'off'
        self.save()
        delivery.compose(self.root, 'codex', {'hook_event_name': 'UserPromptSubmit', 'session_id': 'one', 'prompt': 'governance'})
        path = self.root / '.governance/context' / delivery.session_name('one')
        self.assertTrue(path.exists())
        delivery.compose(self.root, 'codex', {'hook_event_name': 'SessionEnd', 'session_id': 'one'})
        self.assertFalse(path.exists())

    def test_skill_text_is_delivered(self):
        """Required skill bodies accompany required repository text."""
        from project_governance_runtime.installation import materialize_skills
        materialize_skills(self.root)
        self.router['default_skills'] = ['work']
        self.save()
        packet = self.resolve(semantic_off=True)
        rendered = json.loads(delivery.render(self.root, packet).split('\n', 1)[1])
        self.assertEqual(len(rendered['sources']), 3)
        self.assertIn('# Work', rendered['sources'][-1]['text'])

    def test_worker_preflights_entire_batch(self):
        """One forbidden candidate prevents all parallel sends, including safe siblings."""
        import io
        data = {'token': 'synthetic-token', 'timeout': 1,
                'payloads': [jev.request('task', 'safe'), jev.request('task', ('-----BEGIN ' + 'PRIVATE KEY-----'))]}
        with patch('sys.stdin', io.TextIOWrapper(io.BytesIO(json.dumps(data).encode()))), patch('sys.stdout', new_callable=io.StringIO) as output, patch('http.client.HTTPSConnection', side_effect=AssertionError('network')):
            jev.worker()
        self.assertEqual(json.loads(output.getvalue())['reason'], 'egress-secret-detected')

    def test_strict_scores_and_duplicate_json(self):
        for score in (True, -1, 2, float('nan'), 'yes'):
            with self.assertRaises(ValueError):
                jev.decode(json.dumps({'model': jev.MODEL, 'answers': {'relevant': {'type': 'noul', 'noul': score}}}), jev.MODEL)
        with self.assertRaises(ValueError):
            jev.decode('{"model":"a","model":"b"}', jev.MODEL)

    def test_setup_receipt_invalidated_when_probe_fails(self):
        with patch.dict(os.environ, {'JEV_TOKEN': 'synthetic-credential'}), patch.object(jev, 'evaluate', return_value={'status': 'scored'}):
            self.assertEqual(jev.setup(self.root)['status'], 'ready')
            self.assertEqual(jev.readiness(self.root)['status'], 'ready')
            with patch.object(jev, 'evaluate', return_value={'status': 'fallback'}):
                jev.setup(self.root)
            self.assertEqual(jev.readiness(self.root)['status'], 'inactive')

    def test_invalid_configuration_rejected(self):
        for value in ({'mode': 'on'}, {'allow_paths': ['../secret']}, {'deadline_seconds': float('nan')}, {'mode': 'unknown'}):
            with self.assertRaises(ValueError):
                options({'semantic_selection': value})


if __name__ == '__main__':
    unittest.main()
