#!/usr/bin/env python3
"""Exercise native provider protocols over real pipes without network or credentials."""

import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import uuid


ARGS = sys.argv[1:]
SCENARIO = os.environ.get("PROVIDER_AGENT_FIXTURE_SCENARIO", "normal")
LOG = Path(os.environ["PROVIDER_AGENT_FIXTURE_LOG"])
LOG.mkdir(exist_ok=True)
SESSION = str(uuid.uuid4())
RESUMED = False


def arg(name):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else None


def emit(item):
    print(json.dumps(item, ensure_ascii=False), flush=True)


def reply(request, result):
    emit({"id": request["id"], "result": result})


def completion():
    value = {"outcome": "completed", "answer": "Completed: café 🦉", "artifacts": [],
             "checks": [], "sources": [], "remaining": []}
    if not RESUMED and os.environ.get("PROVIDER_AGENT_FIXTURE_ANSWER"):
        value["answer"] = Path(os.environ["PROVIDER_AGENT_FIXTURE_ANSWER"]).read_text()
    if SCENARIO == "blocked":
        value.update(outcome="blocked", remaining=["Missing task input"])
    if SCENARIO == "remaining":
        value["remaining"] = ["Still needs a test"]
    if SCENARIO == "missing_artifact":
        value["artifacts"] = [str(Path.cwd() / "missing-artifact.txt")]
    if SCENARIO == "invalid_completion":
        value["checks"] = "not an array"
    return value


def activity():
    if SCENARIO in {"sleep", "child", "detached_child"}:
        if SCENARIO != "sleep":
            child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(120)"],
                                     start_new_session=SCENARIO == "detached_child")
            (LOG / "child.json").write_text(json.dumps({"pid": child.pid}))
        (LOG / "ready").write_text(str(os.getpid()))
        time.sleep(120)
    if SCENARIO == "malformed":
        print('{"invalid":}', flush=True)
        raise SystemExit(0)
    if SCENARIO == "truncated":
        print('{"unfinished":', end="", flush=True)
        raise SystemExit(0)
    if SCENARIO == "missing_result":
        raise SystemExit(0)


def terminal():
    if SCENARIO == "no_exit":
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        time.sleep(120)
    raise SystemExit(7 if SCENARIO == "nonzero" else 0)


def gemini():
    session = arg("--conversation") or SESSION
    selected = "wrong-model" if SCENARIO == "wrong_model" else arg("--model")
    if SCENARIO == "startup_error":
        emit({"event": "result", "result": {"status": "ERROR", "error": "Authentication required"}})
        raise SystemExit(1)
    init = {"event": "init", "conversation_id": session, "init": {
        "model": selected, "cwd": os.getcwd(), "tools": ["view_file", "run_command"],
        "permission_mode": "request-review" if SCENARIO == "wrong_permissions" else "always-proceed"}}
    if SCENARIO == "delayed_init":
        emit({"event": "step_update", "step_update": {"step_index": 0, "step_type": "agent_response",
                                                       "text_delta": "Early progress.\n", "state": "DONE"}})
    emit(init)
    for line in sys.stdin:
        (LOG / "input.json").write_text(line)
        emit({"event": "step_update", "step_update": {"step_index": 1, "step_type": "agent_response",
                                                       "text_delta": "Working.\n", "state": "DONE"}})
        activity()
        if SCENARIO != "no_tools":
            emit({"event": "step_update", "conversation_id": str(uuid.uuid4()) if
                  SCENARIO == "intermediate_session_drift" else session, "step_update": {"step_index": 2, "step_type": "tool",
                  "tool_name": "run_command", "state": "ERROR" if SCENARIO == "denied" else "DONE",
                  "tool_info": {"parameters": {"CommandLine": "python3 -m unittest"}, "output": "OK",
                                "error": "Permission denied" if SCENARIO == "denied" else None}}})
        value = completion()
        emit({"event": "result", "result": {"status": "SUCCESS", "conversation_id":
              str(uuid.uuid4()) if SCENARIO == "session_drift" else session,
              "response": json.dumps(value), "structured_output": value}})
        terminal()


def claude():
    global RESUMED
    RESUMED = bool(arg("--resume"))
    session = arg("--resume") or SESSION
    selected = "wrong-model" if SCENARIO == "wrong_model" else arg("--model")
    if SCENARIO == "startup_error":
        emit({"type": "result", "subtype": "success", "is_error": True,
              "result": "Not logged in", "session_id": session})
        raise SystemExit(1)
    emit({"type": "system", "subtype": "init", "session_id": session, "model": selected,
          "permissionMode": "plan" if SCENARIO == "wrong_permissions" else "bypassPermissions",
          "tools": ["Read", "Edit", "Bash", "WebFetch"], "claude_code_version": "fixture"})
    (LOG / "input.txt").write_text(sys.stdin.read())
    emit({"type": "stream_event", "session_id": session, "event": {
          "type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Working.\n"}}})
    activity()
    model = "fallback-model" if SCENARIO == "fallback" else selected
    if SCENARIO != "no_tools":
        emit({"type": "assistant", "session_id": session, "message": {"id": "msg1", "model": model,
              "content": [{"type": "tool_use", "id": "tool1", "name": "Bash", "input": {"command": "true"}}]}})
        emit({"type": "user", "session_id": session, "message": {"content": [
              {"type": "tool_result", "tool_use_id": "tool1", "is_error": SCENARIO == "denied",
               "content": "Permission denied" if SCENARIO == "denied" else "OK"}]}})
    value = completion()
    emit({"type": "result", "subtype": "success", "is_error": False, "session_id":
          str(uuid.uuid4()) if SCENARIO == "session_drift" else session,
          "result": json.dumps(value), "structured_output": value,
          "modelUsage": {model: {"inputTokens": 5, "outputTokens": 10}}, "permission_denials": []})
    terminal()


def _codex_turn(request, session, selected):
    reply(request, {"turn": {"id": "turn1", "status": "inProgress", "items": []}})
    if SCENARIO == "callback_turn":
        emit({"id": 90, "method": "item/tool/requestUserInput", "params": {"threadId": session, "turnId": "turn1"}})
        return
    emit({"method": "item/agentMessage/delta", "params": {"threadId": session, "turnId": "turn1",
          "itemId": "message1", "delta": "Working.\n"}})
    activity()
    if SCENARIO == "fallback":
        emit({"method": "model/rerouted", "params": {"threadId": session, "turnId": "turn1",
              "fromModel": selected, "toModel": "fallback-model", "reason": "unavailable"}})
    if SCENARIO != "no_tools":
        emit({"method": "item/completed", "params": {"threadId": session, "turnId": "turn1",
              "item": {"id": "tool1", "type": "commandExecution", "command": "true",
              "status": "declined" if SCENARIO == "denied" else "completed",
              "exitCode": None if SCENARIO == "denied" else 0, "aggregatedOutput": "OK"}}})
    value = completion()
    emit({"method": "item/completed", "params": {"threadId": session, "turnId": "turn1",
          "item": {"id": "message2", "type": "agentMessage", "phase": "final_answer",
                   "text": json.dumps(value)}}})
    emit({"method": "turn/completed", "params": {"threadId":
          str(uuid.uuid4()) if SCENARIO == "session_drift" else session,
          "turn": {"id": "turn1", "status": "completed", "items": []}}})
    if SCENARIO == "nonzero":
        raise SystemExit(7)


def codex():
    global RESUMED
    session = SESSION
    selected = None
    for line in sys.stdin:
        request = json.loads(line)
        (LOG / "input.jsonl").open("a").write(line)
        method, params = request.get("method"), request.get("params", {})
        if method == "initialize":
            if SCENARIO == "callback_init":
                emit({"id": 90, "method": "mcpServer/elicitation/request", "params": {"serverName": "fixture"}})
            reply(request, {"userAgent": "fixture", "platformFamily": "unix", "platformOs": "linux"})
        elif method in {"thread/start", "thread/resume"}:
            RESUMED = method == "thread/resume"
            if SCENARIO == "startup_error":
                emit({"id": request["id"], "error": {"code": -1, "message": "Authentication required"}})
                continue
            session = params.get("threadId", SESSION)
            selected = "wrong-model" if SCENARIO == "wrong_model" else params["model"]
            effort = params.get("config", {}).get("model_reasoning_effort")
            reply(request, {"thread": {"id": session}, "model": selected, "reasoningEffort": effort,
                            "approvalPolicy": "never", "sandbox": {"type": "readOnly" if
                            SCENARIO == "wrong_permissions" else "dangerFullAccess"}, "cwd": os.getcwd()})
        elif method == "turn/start":
            _codex_turn(request, session, selected)
        elif method == "turn/interrupt":
            reply(request, {})


if ARGS == ["--version"]:
    if SCENARIO == "slow_version":
        time.sleep(.5)
    print("provider-fixture 1.0")
elif ARGS == ["models"]:
    print("fixture-model")
else:
    (LOG / (str(os.getpid()) + ".argv.json")).write_text(json.dumps(ARGS))
    if "app-server" in ARGS:
        codex()
    elif "--print" in ARGS or "-p" in ARGS:
        claude()
    else:
        gemini()
