import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { kmpDoctorFindings } from "../src/checkers/kmp-doctor.ts";
import { mergePacks } from "../src/pack-configuration.ts";
import { checkKmpSurface } from "../src/checkers/kmp-surface.ts";
import { ValidationSubject, resolveChangeScope } from "../src/change-subject.ts";

test("KMP route composition preserves target-local obligations and immutable staged references", () => {
  const root = mkdtempSync(join(tmpdir(), "kmp-surface-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  const write = (path: string, value: unknown) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), typeof value === "string" ? value : JSON.stringify(value)); };
  try {
    git("init", "-q"); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "Initial");
    for (const path of ["contract.md", "shared.kt", "shared.test", "ios.swift", "ios.test"]) write(path, "reference only; not execution proof");
    write("targets.json", { kind: "kmp-surface-target-catalog", schema_version: 1, targets: ["ios"] });
    const area = { id: "capture", summary: "Shared capture contract", validation: "guarded", contract: { path: "contract.md" },
      required_checkpoint_roles: ["shared", "renderer"], required_proof_claims: ["behavior", "visible"], required_target_proof_claims: ["visible"],
      shared_route: { checkpoints: [{ role: "shared", path: "shared.kt" }], proofs: [{ path: "shared.test", claims: ["behavior"] }] },
      target_routes: [{ target: "ios", checkpoints: [{ role: "renderer", path: "ios.swift" }], proofs: [{ path: "ios.test", claims: ["visible"] }] }] };
    const graph = { kind: "kmp-surface-validation", schema_version: 1, target_catalog: "targets.json", areas: [area] };
    const path = "config/validation/kmp-surfaces.yaml";
    const evaluate = () => checkKmpSurface(new ValidationSubject(root, resolveChangeScope(root, { all: true })));
    write(path, graph); assert.equal(evaluate().status, "passed");
    const packs = mergePacks([{ source: "fixture", origin: "target", value: { id: "kmp-surface-validation", enforcement: "blocking", stages: ["nightly-review"],
      path_globs: ["config/validation/**", "targets.json"], commands: [{ builtin: "kmp-surface-validation" }] } }]);
    const doctor = () => kmpDoctorFindings(new ValidationSubject(root, resolveChangeScope(root, { all: true })), packs);
    write("config/governance/profile.yaml", { context_router: { routes: [{ skills: ["kmp-implementation"] }] } });
    assert.deepEqual(doctor(), []);
    write("config/governance/profile.yaml", { context_router: { default_skills: ["kmp-implementation"], routes: [] } });
    assert.match(doctor().join("\n"), /route.skills/);
    write("config/governance/profile.yaml", { context_router: { routes: [{ skills: ["kmp-implementation"] }] } });
    packs["kmp-surface-validation"]!.commands.push({ builtin: "kmp-surface-validation" });
    assert.match(doctor().join("\n"), /exactly one active invocation/);
    packs["kmp-surface-validation"]!.commands.pop();
    assert.deepEqual(kmpDoctorFindings(new ValidationSubject(root, resolveChangeScope(root, { all: true })), {}), []);
    area.target_routes[0]!.proofs = [];
    write(path, graph); assert.equal(evaluate().findings[0]?.rule_id, "kmp-surface.proof-gap");
    const structural = checkKmpSurface(new ValidationSubject(root, resolveChangeScope(root, { all: true })), false);
    assert.equal(structural.status, "passed");
    assert.deepEqual(doctor(), []);
    area.target_routes[0]!.proofs = [{ path: "ios.test", claims: ["visible"] }];
    write(path, graph); git("add", ".");
    const staged = new ValidationSubject(root, resolveChangeScope(root, { staged: true }));
    rmSync(join(root, "ios.test"));
    assert.equal(checkKmpSurface(staged).status, "passed");
    assert.equal(evaluate().status, "failed");
    write(path, '{"kind":"kmp-surface-validation","kind":"duplicate"}');
    assert.equal(evaluate().findings[0]?.rule_id, "kmp-surface.structure-invalid");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
