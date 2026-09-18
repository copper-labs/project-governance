"""Probe Codex hook transport against a local fake model; never qualify desktop delivery.

Only synthetic hook text is generated. Requests/events remain in memory and only bounded
observations are written. The temporary app server uses a loopback fake Responses endpoint,
not a model account. A trust bypass is permitted only after inventory proves every enabled
hook is an exact fixture handler; this is not a production installation mechanism.
"""

from __future__ import annotations

import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import queue
import shlex
import subprocess
import sys
import tempfile
import threading
import time


MAX_REQUEST_BYTES = 4 * 1024 * 1024


def text_fields(value):
    """Read text parts, not serialized JSON whose escaping changes exact byte identity."""
    return [part.get("text", "") for item in value.get("input", [])
            for part in item.get("content", []) if isinstance(part, dict)]


def observations(expected, requests, events):
    """Separate hook stdout from request capture and the unsupported raw-event diagnostic."""
    request_text = [text for value in requests for text in text_fields(value)]
    hook_text, raw_text = [], []
    completed = False
    for event in events:
        params = event.get("params", {})
        if event.get("method") == "hook/completed":
            hook_text.extend(item.get("text", "") for item in params.get("run", {}).get("entries", []))
        if event.get("method") == "rawResponseItem/completed":
            raw_text.extend(part.get("text", "") for part in params.get("item", {}).get("content", []))
        if event.get("method") == "turn/completed":
            completed = params.get("turn", {}).get("status") == "completed"
    return {
        "turn_completed": completed,
        "request_count": len(requests),
        "candidates": [{
            "sha256": hashlib.sha256(text.encode()).hexdigest(),
            "bytes": len(text.encode()),
            "hook_reported_full_text": any(text == candidate for candidate in hook_text),
            "local_request_contains_full_text": any(text in candidate for candidate in request_text),
            "internal_raw_event_contains_full_text": any(text in candidate for candidate in raw_text),
        } for text in expected],
        # A captured local fake request does not certify an ordinary desktop session.
        "desktop_delivery_qualified": False,
    }


def fixture_hooks_only(result, commands):
    """Fail closed before bypassing trust if any unrelated hook would be enabled."""
    configured = []
    for group in result.get("data", []):
        if group.get("errors") or group.get("warnings"):
            return False
        for hook in group.get("hooks", []):
            if hook.get("enabled"):
                if (hook.get("eventName") != "userPromptSubmit"
                        or hook.get("handlerType") != "command"
                        or hook.get("source") != "sessionFlags"
                        or hook.get("command") not in commands):
                    return False
                configured.append(hook["command"])
    return sorted(configured) == sorted(commands)


def fake_response():
    """Complete one model request without invoking inference or generating tool calls."""
    item = {"id": "msg_fixture", "type": "message", "role": "assistant", "status": "completed",
            "content": [{"type": "output_text", "text": "Synthetic probe complete.", "annotations": []}]}
    response = {"id": "resp_fixture", "object": "response", "status": "completed", "output": [item],
                "usage": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}}
    values = [
        {"type": "response.created", "response": dict(response, status="in_progress", output=[])},
        {"type": "response.output_item.added", "output_index": 0, "item": dict(item, status="in_progress", content=[])},
        {"type": "response.output_text.delta", "item_id": item["id"], "output_index": 0,
         "content_index": 0, "delta": "Synthetic probe complete."},
        {"type": "response.output_item.done", "output_index": 0, "item": item},
        {"type": "response.completed", "response": response},
    ]
    return "".join("event: " + value["type"] + "\ndata: " + json.dumps(value) + "\n\n" for value in values).encode()


def _exchange(process, root, handlers, groups, timeout):
    """Drive the bounded fixture protocol after enumerating trusted hook commands."""
    events = []
    received = queue.Queue()
    def read_events():
        for line in process.stdout:
            try:
                received.put(json.loads(line))
            except ValueError:
                received.put({"error": "non-json protocol output"})
        received.put(None)
    threading.Thread(target=read_events, daemon=True).start()
    def send(value):
        process.stdin.write(json.dumps(value) + "\n")
        process.stdin.flush()
    send({"id": 0, "method": "initialize", "params": {
        "clientInfo": {"name": "governance_context_probe", "version": "1"},
        "capabilities": {"experimentalApi": True}}})
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        event = received.get(timeout=max(0.01, end - time.monotonic()))
        if event is None or "error" in event:
            raise RuntimeError("Host protocol failed; no delivery qualification")
        events.append(event)
        if event.get("id") == 0:
            send({"method": "initialized", "params": {}})
            send({"id": 1, "method": "hooks/list", "params": {"cwds": [str(root)]}})
        elif event.get("id") == 1:
            if not fixture_hooks_only(event.get("result", {}), [h["command"] for h in handlers]):
                raise RuntimeError("Hook inventory includes unvetted configuration; probe refused")
            send({"id": 2, "method": "thread/start", "params": {
                "cwd": str(root), "model": "gpt-5.6-sol", "modelProvider": "delivery_probe",
                "ephemeral": True, "experimentalRawEvents": True, "approvalPolicy": "never",
                "sandbox": "read-only", "baseInstructions": "Synthetic transport fixture. No tools.",
                "config": {"bypass_hook_trust": True, "features.hooks": True,
                           "hooks": {"UserPromptSubmit": groups}, "mcp_servers": {}}}})
        elif event.get("id") == 2:
            send({"id": 3, "method": "turn/start", "params": {
                "threadId": event["result"]["thread"]["id"],
                "input": [{"type": "text", "text": "Synthetic context transport fixture. No tools."}]}})
        elif event.get("method") == "turn/completed":
            break
    else:
        raise RuntimeError("Host probe timed out")
    return events


class Handler(BaseHTTPRequestHandler):
    """Capture only bounded synthetic loopback requests."""
    def log_message(self, *args):
        """Suppress local HTTP logging so payloads remain private."""
        pass
    def do_POST(self):
        """Capture one request and respond without model inference."""
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length <= MAX_REQUEST_BYTES:
            self.send_error(413)
            return
        try:
            self.server.observed_requests.append(json.loads(self.rfile.read(length)))
        except ValueError:
            self.send_error(400)
            return
        body = fake_response()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
def probe(codex, limit, count, timeout=30, records=1000):
    """Run one isolated fixture, rejecting foreign hooks before any hook is executed."""
    with tempfile.TemporaryDirectory(prefix="governance-context-probe-") as directory:
        root = Path(directory).resolve()
        expected, handlers = [], []
        for index in range(count):
            text = "BEGIN_CONTEXT_%d\n" % index + "".join(
                "record-%05d: harmless synthetic delivery data.\n" % i for i in range(records)) + "END_CONTEXT_%d" % index
            expected.append(text)
            (root / (str(index) + ".txt")).write_text(text)
            script = root / (str(index) + ".py")
            script.write_text('import json,sys\nfrom pathlib import Path\ne=json.load(sys.stdin)\n'
                              'print(json.dumps({"hookSpecificOutput":{"hookEventName":e["hook_event_name"],'
                              '"additionalContext":Path(__file__).with_suffix(".txt").read_text()}}))\n')
            handler = {"type": "command", "command": shlex.quote(sys.executable) + " " + shlex.quote(str(script)), "timeout": 5}
            if limit is not None:
                handler["additionalContextLimit"] = limit
            handlers.append(handler)
        requests = []

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        server.observed_requests = requests
        server.daemon_threads = True
        threading.Thread(target=server.serve_forever, daemon=True).start()
        groups = [{"hooks": handlers}]
        toml_handlers = ["{type=\"command\",command=" + json.dumps(h["command"]) + ",timeout=5"
                         + (",additionalContextLimit=" + str(limit) if limit is not None else "") + "}" for h in handlers]
        overrides = ["features.hooks=true", "features.plugins=false", "features.code_mode_host=false",
                     "mcp_servers={}", "hooks.UserPromptSubmit=[{hooks=[" + ",".join(toml_handlers) + "]}]",
                     'model_providers.delivery_probe.name="Synthetic loopback transport"',
                     'model_providers.delivery_probe.base_url="http://127.0.0.1:' + str(server.server_port) + '/v1"',
                     'model_providers.delivery_probe.wire_api="responses"',
                     'model_providers.delivery_probe.requires_openai_auth=false',
                     'model_providers.delivery_probe.request_max_retries=0']
        args = [codex, "app-server", "--stdio"]
        for override in overrides:
            args.extend(["-c", override])
        env = {k: v for k, v in os.environ.items() if k not in {
            "CODEX_THREAD_ID", "CODEX_SESSION_ID", "CODEX_CI", "CODEX_INTERNAL_ORIGINATOR_OVERRIDE"}}
        process = None
        events = []
        try:
            process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                       stderr=subprocess.DEVNULL, text=True, env=env, cwd=root)
            events = _exchange(process, root, handlers, groups, timeout)
            result = observations(expected, requests, events)
            result["additional_context_limit"] = limit
            return result
        except queue.Empty as error:
            raise RuntimeError("Host probe timed out") from error
        finally:
            if process is not None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            server.shutdown()
            server.server_close()


def main():
    """Run synthetic host characterization and keep operational evidence private."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--codex", default="codex")
    parser.add_argument("--output", type=Path, required=True, help="Private result path outside the source checkout")
    args = parser.parse_args()
    source = Path(__file__).resolve().parents[1]
    destination = args.output.resolve()
    if source == destination or source in destination.parents:
        parser.error("Operational evidence must stay outside this checkout")
    version = subprocess.run([args.codex, "--version"], capture_output=True, text=True, check=True, timeout=10).stdout.strip()
    try:
        cases = [probe(args.codex, None, 1), probe(args.codex, 0, 1), probe(args.codex, 0, 2),
                 probe(args.codex, 0, 1, records=5200)]
        result = {"schema_version": 1, "host_version": version, "cases": cases,
                  "status": "not-qualified", "inference": "synthetic loopback; no model inference",
                  "limitation": "Internal raw events and a fixture-owned request capture do not certify ordinary desktop per-invocation delivery."}
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        result = {"schema_version": 1, "host_version": version, "status": "probe-failed", "reason": str(error)}
    destination.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))
    return 2  # This spike deliberately never certifies a production host.


if __name__ == "__main__":
    raise SystemExit(main())
