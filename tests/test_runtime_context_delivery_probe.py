"""Prevent a successful hook command from being misreported as model delivery."""

import importlib.util
from pathlib import Path
import unittest


SOURCE = Path(__file__).resolve().parents[1] / "tools/probe_context_delivery.py"
SPEC = importlib.util.spec_from_file_location("context_delivery_probe", SOURCE)
probe = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(probe)


class DeliveryEvidenceTests(unittest.TestCase):
    def test_full_hook_stdout_does_not_prove_full_model_input(self):
        text = "head\nimportant middle\ntail"
        request = {"input": [{"content": [{"type": "input_text", "text": "head\n[shortened]\ntail"}]}]}
        events = [{"method": "hook/completed", "params": {"run": {
            "status": "completed", "entries": [{"kind": "context", "text": text}]}}}]
        result = probe.observations([text], [request], events)
        self.assertTrue(result["candidates"][0]["hook_reported_full_text"])
        self.assertFalse(result["candidates"][0]["local_request_contains_full_text"])
        self.assertFalse(result["desktop_delivery_qualified"])

    def test_exact_local_capture_is_not_desktop_qualification(self):
        text = 'quoted "text"\nUnicode: é'
        request = {"input": [{"content": [{"type": "input_text", "text": text}]}]}
        events = [{"method": "rawResponseItem/completed", "params": {
            "item": {"content": [{"text": text}]}}}]
        result = probe.observations([text], [request], events)
        self.assertTrue(result["candidates"][0]["local_request_contains_full_text"])
        self.assertTrue(result["candidates"][0]["internal_raw_event_contains_full_text"])
        self.assertFalse(result["desktop_delivery_qualified"])
        self.assertNotIn(text, str(result))

    def test_each_merged_payload_must_be_observed_separately(self):
        result = probe.observations(["first", "second"], [{"input": [{"content": [{"text": "first"}]}]}], [])
        self.assertEqual([item["local_request_contains_full_text"] for item in result["candidates"]], [True, False])


class FixtureTrustTests(unittest.TestCase):
    def fixture(self):
        return {"data": [{"hooks": [{"enabled": True, "eventName": "userPromptSubmit",
                                     "handlerType": "command", "source": "sessionFlags", "command": "fixture"}]}]}

    def test_only_exact_fixture_inventory_can_bypass_trust(self):
        self.assertTrue(probe.fixture_hooks_only(self.fixture(), ["fixture"]))
        for field, value in [("command", "foreign"), ("source", "user"), ("eventName", "sessionStart"),
                             ("handlerType", "mcp_tool"), ("enabled", False)]:
            result = self.fixture()
            result["data"][0]["hooks"][0][field] = value
            self.assertFalse(probe.fixture_hooks_only(result, ["fixture"]))

    def test_extra_hooks_missing_inventory_or_warnings_stop_probe(self):
        result = self.fixture()
        result["data"][0]["hooks"].append(dict(result["data"][0]["hooks"][0], command="foreign"))
        self.assertFalse(probe.fixture_hooks_only(result, ["fixture"]))
        self.assertFalse(probe.fixture_hooks_only({}, ["fixture"]))
        result = self.fixture()
        result["data"][0]["warnings"] = ["configuration warning"]
        self.assertFalse(probe.fixture_hooks_only(result, ["fixture"]))


if __name__ == "__main__":
    unittest.main()
