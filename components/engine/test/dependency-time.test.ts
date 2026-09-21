import { test } from "node:test";
import assert from "node:assert/strict";
import { dependencyMoment, dayMicroseconds } from "../src/checkers/dependency-time.ts";

test("dependency dates preserve timezone equality and exact full-day boundaries", () => {
  assert.equal(dependencyMoment("2026-09-20T12:00:00-04:00", "time"), dependencyMoment("2026-09-20T16:00:00Z", "time"));
  const start = dependencyMoment("2026-09-20", "time"), end = dependencyMoment("2026-09-20", "time", true);
  assert.equal(end - start, dayMicroseconds - 1n);
  assert.equal(dependencyMoment("2026-09-20T00:00:00.000001Z", "time") - start, 1n);
  assert.equal(dependencyMoment("2026-09-21", "time") - start, dayMicroseconds);
});

test("invalid and timezone-free dependency timestamps cannot normalize into trusted evidence", () => {
  for (const value of ["2026-02-30", "2026-09-20T12:00:00", "2026-09-20T24:00:00Z", "2026-09-20T12:00:00+24:00", "2026-09-20T12:00:00+01:60", "", null])
    assert.throws(() => dependencyMoment(value, "evaluated_at"));
});
