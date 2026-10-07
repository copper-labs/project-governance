import test from "node:test";
import assert from "node:assert/strict";
import { PROVIDER_COMMANDS, COMMAND_RECOVERY_COMMANDS } from "../src/provider-job-command.ts";
import { managedCommandEffect } from "../src/runtime-invocation.ts";

test("all public provider and generic recovery verbs have a managed invocation owner", () => {
  for (const command of PROVIDER_COMMANDS) assert.notEqual(managedCommandEffect(command), null, command);
  for (const command of COMMAND_RECOVERY_COMMANDS) assert.equal(managedCommandEffect(command), "write", command);
  assert.equal(managedCommandEffect("check-reconcile"), "write", "check reader recovery writes evidence and releases a verified reservation");
  assert.equal(managedCommandEffect("check-output"), "write", "output selection retains decision receipts and spending");
  for (const command of ["plan", "provider-status", "provider-wait"]) assert.equal(managedCommandEffect(command), "write", "optional decision receipts and budget counters require managed write admission");
  assert.equal(managedCommandEffect("invented-command"), null);
});

test("delivery commands enter the managed generation with their actual mutation scope", () => {
  assert.equal(managedCommandEffect("implementation-plan", ["inspect"]), "read");
  assert.equal(managedCommandEffect("implementation-plan", ["update"]), "write");
  assert.equal(managedCommandEffect("lint", ["setup"]), "read");
  assert.equal(managedCommandEffect("lint", ["setup", "--apply"]), "write");
  assert.equal(managedCommandEffect("lint-adapter"), "write");
  assert.equal(managedCommandEffect("release-evaluation"), "read");
  assert.equal(managedCommandEffect("release-evaluation", ["report"]), "read");
  assert.equal(managedCommandEffect("release-evaluation", ["capture"]), "write");
  assert.equal(managedCommandEffect("task-facts", ["--session", "exact-chat"]), "read");
});

test("supplied evaluator invocation reserves a write generation for budgets and immutable receipts", () => {
  assert.equal(managedCommandEffect("evaluate", ["--request-file", "request.json"]), "write");
  assert.equal(managedCommandEffect("evaluate", ["--request-file", "local-only.json"]), "write",
    "A local-only result still enters the same conservative write owner");
});
