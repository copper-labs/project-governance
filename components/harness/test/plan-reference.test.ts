import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlanReference } from "../src/model/plan-reference.ts";

const reference = { version: 1, path: "docs/exec-plans/active/example.md", batch: "F1", definition_digest: `sha256:${"a".repeat(64)}` };

test("a plan reference preserves exact portable identity without reading a plan", () => {
    assert.deepEqual(parsePlanReference(reference), reference);
    assert.notEqual(parsePlanReference(reference), reference);
});

test("plan references refuse unsafe locators and ambiguous field shapes", () => {
    const invalid: unknown[] = [null, [], JSON.stringify(reference), { ...reference, version: 2 },
        { ...reference, extra: true }, { ...reference, definition_digest: "sha256:abc" },
        { ...reference, batch: "F 1" }, { ...reference, batch: "F".repeat(101) },
        ...["/docs/exec-plans/active/example.md", "docs/exec-plans/../example.md", "docs/exec-plans/./example.md",
            "docs/exec-plans//example.md", "docs/exec-plans/active\\example.md", "docs/exec-plans/active/example\0.md",
            "docs/exec-plans/active/example\n.md", "docs/plans/example.md", "docs/exec-plans/example.txt"]
            .map(path => ({ ...reference, path })),
    ];
    const { batch: _, ...missingBatch } = reference;
    invalid.push(missingBatch);
    for (const value of invalid) assert.throws(() => parsePlanReference(value));
});
