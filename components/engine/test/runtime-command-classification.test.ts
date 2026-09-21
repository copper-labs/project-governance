import test from "node:test";
import assert from "node:assert/strict";
import { PROVIDER_COMMANDS, COMMAND_RECOVERY_COMMANDS } from "../src/provider-job-command.ts";
import { managedCommandEffect } from "../src/runtime-invocation.ts";

test("all public provider and generic recovery verbs have a managed invocation owner", () => {
  for (const command of PROVIDER_COMMANDS) assert.notEqual(managedCommandEffect(command), null, command);
  for (const command of COMMAND_RECOVERY_COMMANDS) assert.equal(managedCommandEffect(command), "write", command);
  for (const command of ["plan", "provider-status", "provider-wait"]) assert.equal(managedCommandEffect(command), "write", "optional decision receipts and budget counters require managed write admission");
  assert.equal(managedCommandEffect("invented-command"), null);
});
