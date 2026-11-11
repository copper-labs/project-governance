import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const moduleUrl = process.env.GOVERNANCE_TEST_PACKAGE
  ? pathToFileURL(join(process.env.GOVERNANCE_TEST_PACKAGE, "dist/engine/src/command-processes.js")).href
  : new URL("../src/command-processes.ts", import.meta.url).href;
const { commandProcessesPresent, observeCommandIncarnations, parseCommandProcesses }: typeof import("../src/command-processes.ts") = await import(moduleUrl);

const before = "Wed Nov 11 01:00:00 2026", after = "Wed Nov 11 01:01:00 2026";
const observer = `10 1 10 S ${before}`;
const capture = (row: { pid: number; incarnation: string }) => ({ pid: row.pid, fingerprint: row.incarnation, incarnation: row.incarnation });

test("one complete inventory binds BSD and Linux process start identities to ancestry", () => {
  const rows = parseCommandProcesses(`${observer}\n20 10 20 Z ${before}\n21 10 20 Zl ${after}\n`, 10);
  assert.deepEqual(rows, [{ pid: 10, parent: 1, group: 10, incarnation: before },
    { pid: 21, parent: 10, group: 20, incarnation: after }]);
  for (const raw of ["", `20 1 20 S ${before}`, `${observer}\n20 1 20 S -`, `${observer}\n${observer}`, `${observer}\n20 1 20 S unavailable`,
    `${observer}\n9007199254740993 1 20 S ${before}`, `${observer}\n20 9007199254740993 20 S ${before}`,
    `${observer}\n20 1 9007199254740993 S ${before}`, `${observer}\n${"9".repeat(400)} 1 20 S ${before}`])
    assert.throws(() => parseCommandProcesses(raw, 10));
  assert.deepEqual(parseCommandProcesses(`${observer}\n0 0 0 S ${before}`, 10)[1],
    { pid: 0, parent: 0, group: 0, incarnation: before }, "valid platform zero fields stay representable");
});

test("positive replacement proof cannot weaken legacy, live-original or missing-identity refusal", () => {
  const identities = [{ pid: 20, fingerprint: before, incarnation: before }];
  const replacement = [{ pid: 20, parent: 1, group: 20, incarnation: after }];
  assert.equal(commandProcessesPresent(replacement, identities, 99, true), false);
  assert.equal(commandProcessesPresent(replacement, identities, 99, false), true);
  assert.equal(commandProcessesPresent(replacement, identities, 20, true), true, "unanchored surviving group remains ambiguous");
  assert.equal(commandProcessesPresent([{ ...replacement[0]!, incarnation: before }], identities, 99, true), true);
  assert.throws(() => commandProcessesPresent([{ pid: 20, parent: 1, group: 20 }], identities, 99, true));
  assert.throws(() => commandProcessesPresent([], [{ pid: 20, fingerprint: before, incarnation: "unknown" }], 99, true));
});

test("a proven reused descendant adds its incarnation without losing the original history", () => {
  const original = { pid: 20, fingerprint: before, incarnation: before }, parent = { pid: 10, fingerprint: before, incarnation: before };
  const known = new Map([[10, before], [20, before]]);
  const history = new Map([[JSON.stringify([10, before]), parent], [JSON.stringify([20, before]), original]]);
  const current = observeCommandIncarnations([{ ...parent, parent: 1, group: 10 },
    { pid: 20, parent: 10, group: 20, incarnation: after }], 10, known, history, capture);
  assert.deepEqual(current, [parent, { pid: 20, fingerprint: after, incarnation: after }]);
  assert.deepEqual([...history.values()], [parent, original, { pid: 20, fingerprint: after, incarnation: after }]);
  assert.equal(known.get(20), after);
});

test("a detached replacement cannot inherit the departed process's group authority", () => {
  const original = { pid: 20, fingerprint: before, incarnation: before }, known = new Map([[20, before]]);
  const history = new Map([[JSON.stringify([20, before]), original]]);
  assert.deepEqual(observeCommandIncarnations([{ pid: 20, parent: 1, group: 20, incarnation: after },
    { pid: 21, parent: 20, group: 20, incarnation: after }], 20, known, history, capture), []);
  assert.deepEqual([...history.values()], [original]);
  assert.equal(known.get(20), before);
  assert.throws(() => observeCommandIncarnations([{ pid: 20, parent: 1, group: 20 }], 20, known, history, capture));
});
