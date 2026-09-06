"""Codex's bidirectional local app-server adapter, with explicit session settings."""

import json

from .config import AgentError
from .protocol import FINAL_SCHEMA, Protocol, prompt


class Codex(Protocol):
    """Run one exact Codex turn through the bidirectional native app-server protocol."""
    persistent_server = True

    def __init__(self, request, emit):
        super().__init__(request, emit)
        self.turn_id, self.answer = None, None
        self.message_text = {}

    def command(self, path):
        """Start an owned stdio server without changing user configuration."""
        return [self.request["backend"], "app-server", "--stdio"]

    def initial_input(self):
        """Identify this client and begin the native protocol handshake."""
        return self.wire({"id": 0, "method": "initialize", "params": {
            "clientInfo": {"name": "project_governance_agent", "version": "1.0"}}})

    @staticmethod
    def wire(item):
        """Encode one complete JSON-RPC message for the local server."""
        return (json.dumps(item) + "\n").encode()

    def callback(self, item):
        """Answer server requests explicitly and stop when parent assistance is required."""
        method = item["method"]
        if method in {"item/commandExecution/requestApproval", "item/fileChange/requestApproval"}:
            response = {"result": {"decision": "cancel"}}
        elif method == "mcpServer/elicitation/request":
            response = {"result": {"action": "cancel", "content": None, "_meta": None}}
        elif method == "item/tool/requestUserInput":
            response = {"result": {"answers": {}}}
        elif method == "item/tool/call":
            response = {"result": {"success": False, "contentItems": [
                {"type": "inputText", "text": "Parent-only tool is unavailable to this wrapper"}]}}
        else:
            response = {"error": {"code": -32601, "message": "This wrapper cannot resolve " + method}}
        self.pending.append(self.wire({"id": item["id"], **response}))
        self.denied.append({"request": method, "reason": "Requires user input, authority, or an unavailable client tool"})
        self.emit("denied", message="Codex requires parent assistance: " + method)
        if self.turn_id:
            self.pending.append(self.wire({"id": 9, "method": "turn/interrupt", "params": {
                "threadId": self.conversation_id, "turnId": self.turn_id}}))
        self.stop_requested = True

    def accept(self, item):
        """Validate settings and turn identity before crediting progress or completion."""
        if not isinstance(item, dict):
            raise AgentError("invalid Codex message")
        if "id" in item and "method" in item:
            self.callback(item)
            return
        if self.stop_requested:
            return
        if "id" in item:
            self._response(item)
            return
        self._notification(item)

    def _response(self, item):
        if item.get("error"):
            raise AgentError("Codex request failed: " + str(item["error"]))
        value = item.get("result", {})
        if item["id"] == 0:
            self._request_thread()
        elif item["id"] == 1:
            self._request_turn(value)
        elif item["id"] == 2:
            self.turn_id = value.get("turn", {}).get("id")
            if not self.turn_id:
                raise AgentError("Codex did not identify the started turn")

    def _request_thread(self):
        self.pending.append(self.wire({"method": "initialized", "params": {}}))
        r = self.request
        params = {"model": r["model"], "cwd": r["workspace"], "approvalPolicy": "never",
                  "sandbox": "danger-full-access", "config": {"model_reasoning_effort": r["effort"]}}
        method = "thread/start"
        if r.get("conversation_id"):
            method, params["threadId"] = "thread/resume", r["conversation_id"]
        self.pending.append(self.wire({"id": 1, "method": method, "params": params}))

    def _request_turn(self, value):
        if value.get("approvalPolicy") != "never":
            raise AgentError("Codex did not enable noninteractive execution")
        self.initialize(value.get("model"), value.get("thread", {}).get("id"),
                        value.get("sandbox", {}).get("type"), "dangerFullAccess",
                        effort=value.get("reasoningEffort"), instruction_sources=value.get("instructionSources"))
        if value.get("cwd") != self.request["workspace"]:
            raise AgentError("Codex initialized a different workspace")
        self.pending.append(self.wire({"id": 2, "method": "turn/start", "params": {
            "threadId": self.conversation_id, "input": [{"type": "text", "text": prompt(self.request)}],
            "model": self.request["model"], "effort": self.request["effort"], "outputSchema": FINAL_SCHEMA}}))

    def _notification_identity(self, item):
        method, params = item.get("method"), item.get("params", {})
        if not isinstance(method, str) or not isinstance(params, dict):
            raise AgentError("invalid Codex notification")
        if params.get("threadId"):
            self.session(params["threadId"])
        if self.turn_id and params.get("turnId") and params["turnId"] != self.turn_id:
            raise AgentError("Codex emitted an event for a different turn")
        if method == "model/rerouted":
            raise AgentError("Codex rerouted the requested model: " + str(params.get("toModel")))
        return method, params

    def _notification(self, item):
        method, params = self._notification_identity(item)
        if method == "item/agentMessage/delta":
            self.text(params["delta"])
            key = params["itemId"]
            self.message_text[key] = self.message_text.get(key, "") + params["delta"]
            return
        if method in {"item/started", "item/completed"}:
            self.item(params["item"], method == "item/completed")
            return
        if method == "turn/completed":
            self._complete_turn(params["turn"])
            return
        if method == "thread/tokenUsage/updated":
            self.usage = params.get("tokenUsage", {})
            return
        if method == "error":
            self.emit("diagnostic", message=str(params.get("error", {}))[:4000],
                      retrying=bool(params.get("willRetry")))
            return
        if method == "item/commandExecution/outputDelta":
            self.emit("tool_output", message=str(params.get("delta", ""))[:4000])

    def _complete_turn(self, turn):
        if self.turn_id and turn.get("id") != self.turn_id:
            raise AgentError("Codex completed a different turn")
        if turn.get("status") != "completed":
            raise AgentError("Codex turn failed: " + str(turn.get("error") or turn.get("status")))
        self.complete(self.answer)

    def item(self, value, completed):
        """Record native operations separately from model-reported checks."""
        kind, key = value.get("type"), value.get("id")
        if kind == "agentMessage" and completed:
            self._agent_message(value)
            return
        category = {"commandExecution": "command", "fileChange": "edit", "webSearch": "web",
                    "imageView": "image", "mcpToolCall": "mcp", "dynamicToolCall": "dynamic",
                    "collabToolCall": "delegation"}.get(kind)
        if not category:
            return
        name = value.get("tool") or kind
        state, error = self._tool_state(value, completed)
        self.tool(key, name, category, state, value.get("arguments") or value.get("command") or value.get("changes"),
                  value.get("aggregatedOutput") or value.get("result"), error)

    def _agent_message(self, value):
        text = value.get("text", "")
        streamed = self.message_text.pop(value.get("id"), "")
        if not streamed and text:
            self.text(text)
        if value.get("phase") == "final_answer" or text.lstrip().startswith("{"):
            self.answer = text

    @staticmethod
    def _tool_state(value, completed):
        kind = value.get("type")
        status = value.get("status", "completed" if completed else "inProgress")
        state = "DONE" if status == "completed" else "ERROR" if status in {"failed", "declined"} else "ACTIVE"
        error = value.get("error")
        if status == "declined":
            error = "Permission denied"
        if completed and kind == "commandExecution" and value.get("exitCode") != 0:
            state, error = "ERROR", error or "Command did not exit successfully"
        if completed and kind == "dynamicToolCall" and value.get("success") is False:
            state, error = "ERROR", error or "Dynamic tool failed"
        return state, error
