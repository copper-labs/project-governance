"""Claude Code print adapter with ordinary native configuration and public deltas."""

import json

from .config import AgentError
from .protocol import FINAL_SCHEMA, Protocol, prompt


CATEGORIES = {"Read": "read", "Glob": "read", "Grep": "read", "Edit": "edit", "Write": "edit",
              "NotebookEdit": "edit", "Bash": "command", "PowerShell": "command",
              "WebFetch": "web", "WebSearch": "web"}


class Claude(Protocol):
    """Preserve Claude Code tooling while checking its streamed identity and result."""
    persistent_server = False

    def command(self, path):
        """Select full native tools and disable inherited model fallback for this invocation."""
        r = self.request
        args = [r["backend"], "--print", "--output-format", "stream-json", "--verbose",
                "--include-partial-messages", "--permission-mode", "bypassPermissions", "--tools", "default",
                "--model", r["model"], "--effort", r["effort"],
                "--settings", json.dumps({"fallbackModel": []}), "--json-schema", json.dumps(FINAL_SCHEMA)]
        for root in r["additional_roots"]:
            args += ["--add-dir", root]
        if r.get("conversation_id"):
            args += ["--resume", r["conversation_id"]]
        return args

    def initial_input(self):
        """Send the assignment through stdin without exposing it in process arguments."""
        return prompt(self.request).encode()

    def accept(self, item):
        """Translate public Claude events and reject identity drift or native failures."""
        if not isinstance(item, dict) or not isinstance(item.get("type"), str):
            raise AgentError("invalid Claude stream event")
        if item.get("session_id"):
            self.session(item["session_id"])
        handler = {"system": self._system, "stream_event": self._stream,
                   "assistant": self._assistant, "user": self._user, "result": self._result}.get(item["type"])
        if handler:
            handler(item)

    def _system(self, item):
        if item.get("subtype") == "init":
            self.initialize(item.get("model"), item.get("session_id"), item.get("permissionMode"),
                            "bypassPermissions", item.get("tools"), item.get("effort"),
                            version=item.get("claude_code_version"))
        else:
            self.emit("diagnostic", message=str(item.get("subtype", "provider status")),
                      status=item.get("status"))

    def _message_model(self, item, message):
        model = message.get("model")
        if model and model != "<synthetic>" and not item.get("parent_tool_use_id"):
            self.model(model)

    def _stream(self, item):
        event = item.get("event", {})
        if event.get("type") == "content_block_delta" and event.get("delta", {}).get("type") == "text_delta":
            self.text(event["delta"]["text"])
        elif event.get("type") == "message_start":
            self._message_model(item, event.get("message", {}))

    def _assistant(self, item):
        message = item.get("message", {})
        if item.get("is_api_error_message"):
            raise AgentError("Claude API failure: " + str(message.get("content")))
        self._message_model(item, message)
        for block in message.get("content", []):
            if block.get("type") == "tool_use":
                name = block["name"]
                self.tool(block["id"], name, CATEGORIES.get(name, name), "ACTIVE", block.get("input"))

    def _user(self, item):
        for block in item.get("message", {}).get("content", []):
            if not isinstance(block, dict) or block.get("type") != "tool_result":
                continue
            key = block["tool_use_id"]
            old = self.tools.get(key)
            if not old:
                raise AgentError("Claude returned evidence for an unknown tool call")
            self.tool(key, old["name"], old["category"], "ERROR" if block.get("is_error") else "DONE",
                      output=block.get("content"), error=block.get("content") if block.get("is_error") else None)

    def _result(self, item):
        self.denied.extend(item.get("permission_denials", []))
        if item.get("is_error") or item.get("subtype") != "success":
            self.final = {"status": "ERROR", "response": item.get("result")}
            raise AgentError("Claude failure: " + str(item.get("result") or item.get("errors")))
        self.complete(item.get("result"), item.get("structured_output"),
                      {"usage": item.get("usage"), "models": item.get("modelUsage"),
                       "estimated_cost_usd": item.get("total_cost_usd")})
