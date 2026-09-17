"""Antigravity headless adapter; native tools and authentication remain provider-owned."""

import json
import math

from .config import AgentError
from .protocol import FINAL_SCHEMA, Protocol, prompt


CATEGORIES = {
    "view_file": "read", "list_dir": "read", "find_by_name": "read", "grep_search": "read",
    "write_to_file": "edit", "replace_file_content": "edit", "multi_replace_file_content": "edit",
    "run_command": "command", "command_status": "command", "send_command_input": "command",
    "read_url_content": "web", "search_web": "web", "open_browser_url": "browser",
}


class Gemini(Protocol):
    """Retain Antigravity native tools while validating its headless event stream."""
    persistent_server = False

    def command(self, path):
        """Set exact model and full access while avoiding the native zero-timeout trap."""
        r = self.request
        # Native zero means immediate expiry. Its maximum duration leaves cancellation with the
        # supervisor when the caller disables the overall deadline.
        self.native_print_timeout = str(max(1, math.ceil(r["timeout_seconds"]))) + "s" if r["timeout_seconds"] else "2562047h47m16s"
        args = [r["backend"], "--input-format", "stream-json", "--output-format", "stream-json",
                "--model", r["model"], "--effort", r["effort"], "--mode", "accept-edits",
                "--dangerously-skip-permissions", "--json-schema", json.dumps(FINAL_SCHEMA),
                "--print-timeout", self.native_print_timeout, "--log-file", str(path / "provider.log")]
        for root in [r["workspace"], *r["additional_roots"]]:
            args += ["--add-dir", root]
        args += ["--conversation", r["conversation_id"]] if r.get("conversation_id") else ["--new-project"]
        return args

    def initial_input(self):
        """Frame the assignment as a native user message on stdin."""
        return (json.dumps({"event": "user", "message": {"content": prompt(self.request)}}) + "\n").encode()

    def __init__(self, request, emit):
        super().__init__(request, emit)
        self.before_init, self.before_bytes = [], 0

    def accept(self, item):
        """Buffer early events and accept evidence only after verified initialization."""
        if not isinstance(item, dict) or not isinstance(item.get("event"), str):
            raise AgentError("invalid Antigravity event")
        event = item["event"]
        if event == "init":
            self._initialize(item)
            return
        if event == "result" and item.get("result", {}).get("status") != "SUCCESS":
            self.final = item.get("result")
            raise AgentError("Antigravity failure: " + str(self.final.get("error") or self.final.get("response")))
        if not self.init:
            self._buffer(item)
            return
        if item.get("conversation_id"):
            self.session(item["conversation_id"])
        if event == "step_update":
            self._step(item["step_update"])
        elif event == "result":
            value = item["result"]
            self.session(value.get("conversation_id") or self.conversation_id)
            self.denied.extend(value.get("denied_actions", []))
            self.complete(value.get("response"), value.get("structured_output"), value.get("usage"))

    def _initialize(self, item):
        value = item["init"]
        self.initialize(value.get("model"), item.get("conversation_id"), value.get("permission_mode"),
                        "always-proceed", value.get("tools"), value.get("effort"),
                        native_print_timeout=getattr(self, "native_print_timeout", None))
        for queued in self.before_init:
            self.accept(queued)
        self.before_init.clear()

    def _buffer(self, item):
        self.before_bytes += len(json.dumps(item).encode())
        if len(self.before_init) >= 256 or self.before_bytes > 1048576:
            raise AgentError("provider pre-init event buffer exceeded its limit")
        self.before_init.append(item)

    def _step(self, update):
        if update.get("conversation_id"):
            self.session(update["conversation_id"])
        if update.get("step_type") == "agent_response" and update.get("text_delta"):
            self.text(update["text_delta"])
        if update.get("step_type") == "tool":
            info = update.get("tool_info") or {}
            name = update.get("tool_name") or info.get("name") or "unknown"
            category = CATEGORIES.get(name, "browser" if "browser" in name else name)
            self.tool(str(update.get("step_index")), name, category, update.get("state"),
                      info.get("parameters"), info.get("output"), info.get("error"))
