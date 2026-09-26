import { test } from "node:test";
import assert from "node:assert/strict";
import { ContextTiming } from "../src/context-timing.ts";
import { managedCommandEffect } from "../src/runtime-invocation.ts";

test("slow local preparation leaves an independent provider window within the original operation", () => {
  let now = 0;
  const clock = new ContextTiming(undefined, () => now);
  now = 5500;
  assert.equal(clock.beginSelection(), 9000);
  now += 1150; clock.endSelection(); now += 150;
  const measured = clock.snapshot(1100, 120);
  assert.deepEqual([measured.preparationMs, measured.selectionMs, measured.providerCallMs, measured.deliveryMs, measured.totalMs],
    [5500, 1150, 1100, 150, 6800]);
  assert.equal(measured.limitReason, null);
  now = 8000;
  assert.equal(clock.beginSelection(), 9000, "Starting selection again must not renew its allowance");
});

test("overall exhaustion cannot renew a selection deadline and differs from provider exhaustion", () => {
  let now = 0;
  const late = new ContextTiming(undefined, () => now);
  now = 9800; assert.equal(late.beginSelection(), 10000);
  now = 10005; late.endSelection("cancelled"); assert.equal(late.snapshot(205, 0).limitReason, "operation-deadline");
  const fresh = new ContextTiming(undefined, () => now);
  assert.equal(fresh.beginSelection(), now + 3500);
  now += 3501; fresh.endSelection("cancelled"); assert.equal(fresh.snapshot(3500, 0).limitReason, "selection-deadline");
});

test("terminal transport deadlines and late delivery keep their actual causes", () => {
  let now = 0;
  const selection = new ContextTiming(undefined, () => now); selection.beginSelection();
  now = 3499; selection.endSelection("deadline", undefined, true);
  assert.equal(selection.snapshot().limitReason, "selection-deadline", "Transport timers round to milliseconds");
  const provider = new ContextTiming(undefined, () => now); provider.beginSelection();
  now += 1000; provider.endSelection("deadline"); assert.equal(provider.snapshot().limitReason, "provider-deadline");
  const cancelled = new ContextTiming(undefined, () => now); cancelled.beginSelection();
  cancelled.endSelection("cancelled", AbortSignal.abort()); assert.equal(cancelled.snapshot().limitReason, "caller-cancelled");
  const successful = new ContextTiming(undefined, () => now); successful.beginSelection();
  now += 150; successful.endSelection("answered"); now += 10000;
  assert.equal(successful.snapshot().limitReason, null); assert.equal(successful.snapshot().operationOverrunMs, 150);
});

test("the managed command boundary admits documented index and help commands", () => {
  assert.equal(managedCommandEffect("context-index"), "write");
  for (const command of ["--help", "-h", "help"]) assert.equal(managedCommandEffect(command), "read");
  assert.equal(managedCommandEffect("unrecognized"), null);
});
