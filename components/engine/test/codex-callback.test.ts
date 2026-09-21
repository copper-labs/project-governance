import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { codexCallback } from "../src/codex-callback.ts";
test("Codex callback replies preserve legacy refusal and interruption semantics", () => {
  const methods = ["item/commandExecution/requestApproval", "item/fileChange/requestApproval", "mcpServer/elicitation/request", "item/tool/requestUserInput", "item/tool/call", "unknown/request"];
  const python = `import sys,json\nsys.path.insert(0,'src')\nfrom project_governance_runtime.provider_agents.codex import Codex\nresults=[]\nfor method in json.load(sys.stdin):\n p=Codex({'conversation_id':'session'},lambda *a,**k:None);p.turn_id='turn'\n p.callback({'id':17,'method':method})\n results.append({'messages':[json.loads(v) for v in p.pending],'stopRequested':p.stop_requested,'denial':p.denied[0]})\nprint(json.dumps(results))`;
  const expected = JSON.parse(execFileSync("python3", ["-c", python], { input: JSON.stringify(methods), encoding: "utf8" }));
  assert.deepEqual(methods.map(method => codexCallback({ id: 17, method }, { conversationId: "session", turnId: "turn" })), expected);
});
test("Codex callback never interrupts an unidentified turn or fabricates user input", () => {
  const result = codexCallback({ id: "request", method: "item/tool/requestUserInput" }, { conversationId: null, turnId: null });
  assert.deepEqual(result.messages, [{ id: "request", result: { answers: {} } }]);
  assert.equal(result.stopRequested, true);
  assert.throws(() => codexCallback({ method: "item/tool/call" }, { conversationId: null, turnId: null }), /request id/);
});
