import { observeCoworkCommit, coworkLogTail } from "./cowork-commit-observation.ts";
import { randomUUID } from "node:crypto";
import { mkdirSync, lstatSync, realpathSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { withCoworkBinding, type CoworkBinding } from "./cowork-binding.ts";
import { coworkFileIdentity, coworkFilePath } from "./cowork-files.ts";
import { gitOperationAdmission } from "./git-operation-admission.ts";
import { planGitHookInstallation } from "./git-hook-installation.ts";
import { providerRuntime } from "./provider-runtime.ts";
import { runtimeLauncher } from "./runtime-launcher.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { commandEnvironment, submitCommand, type CommandRequest } from "./process-owner.ts";
import { unrelatedCommitState, originalCoworkCommit, verifyCoworkCommitTree, type CoworkCommitBinding } from "./cowork-commit-binding.ts";
import { checkRunRoot } from "./check-run.ts";
import { commandExecutable } from "./native-check-command.ts";
import { digest } from "./core.ts";

const commandsRoot = () => join(dirname(checkRunRoot()), "cowork-commits");
export function coworkCommit(workspace: string, input: CoworkBinding & { candidate: Array<{ path: string; expected: string }>; message: string }) {
  return withCoworkBinding(workspace, input, true, ({ assertPaths }) => {
    const paths = input.candidate.map(item => coworkFilePath(item.path));
    if (new Set(paths).size !== paths.length) throw new Error("cowork-commit-duplicate-path");
    assertPaths(paths);
    const runtime = providerRuntime(workspace);
    if (!runtime) throw new Error("cowork-commit-installed-runtime-required");
    const launcher = join(workspace, ".governance/runtime/bin/project-governance");
    const executable = join(runtime.directory, "node_modules/@organta/project-governance/dist/engine/src/cli.js");
    if (realpathSync(launcher) !== launcher || narrativeFile(workspace, launcher) !== runtimeLauncher(realpathSync(process.execPath), executable, runtime.registry, runtime.root))
      throw new Error("cowork-commit-launcher-mismatch");
    const hooks = planGitHookInstallation(workspace);
    if (hooks.hooksPath !== ".githooks" || hooks.hooks.some(hook => hook.action !== "current")) throw new Error("cowork-commit-managed-hooks-required");
    if (Object.keys(process.env).some(name => name.startsWith("GIT_CONFIG") && process.env[name]))
      throw new Error("cowork-commit-file-based-configuration-required");
    const before = gitOperationAdmission(workspace), env = commandEnvironment({});
    const selected = input.candidate.map(item => {
      if (coworkFileIdentity(workspace, item.path) !== item.expected) throw new Error("cowork-commit-candidate-conflict");
      const indexEntry = before.git("ls-files", "--stage", "-z", "--", `:(literal)${item.path}`).toString("utf8");
      if (item.expected === "absent") {
        if (!indexEntry && (!before.head || !before.git("ls-tree", "-z", before.head, "--", `:(literal)${item.path}`).length))
          throw new Error("cowork-commit-absent-path-not-tracked");
        return { path: item.path, blob: null, mode: null };
      }
      const blob = before.text("hash-object", `--path=${item.path}`, "--", item.path);
      const trustMode = before.text("config", "--default", "true", "--bool", "--get", "core.fileMode") === "true";
      const mode = !trustMode && indexEntry ? indexEntry.slice(0, 6) : lstatSync(join(workspace, item.path)).mode & 0o100 ? "100755" : "100644";
      return { path: item.path, blob, mode };
    });
    const preservation = unrelatedCommitState(workspace, paths);
    const commitBinding: CoworkCommitBinding = { workspace: before.root, taskId: input.task_id, session: input.session,
      branch: before.branch, parent: before.head, selected, ...preservation };
    // New paths need index admission for --only. No selected content is staged, and no unrelated entry changes.
    for (const item of selected) if (item.blob && !before.git("ls-files", "--", `:(literal)${item.path}`).length)
      before.git("add", "--intent-to-add", "--", `:(literal)${item.path}`);
    for (const item of input.candidate)
      if (coworkFileIdentity(workspace, item.path) !== item.expected) throw new Error("cowork-commit-candidate-conflict");
    const current = gitOperationAdmission(workspace);
    if (current.head !== before.head || current.branch !== before.branch || digest(unrelatedCommitState(workspace, paths)) !== digest(preservation))
      throw new Error("cowork-commit-state-changed");
    const request_id = randomUUID(), root = commandsRoot(); mkdirSync(root, { recursive: true, mode: 0o700 });
    const submitted = submitCommand(join(root, request_id), { id: `cowork-commit:${request_id}`, commitBinding,
      operation: { argv: [commandExecutable("git", workspace), "commit", "--only", "--file", "-", "--", ...paths.map(path => `:(literal)${path}`)],
        cwd: workspace, env, expectedExitCodes: [0], effect: "local" }, stdin: input.message + "\n", deadlineMs: 600_000,
      outputLimit: 1024 * 1024, runtime });
    return { status: "submitted", request_id, request_digest: submitted.requestDigest };
  });
}
export function coworkCommitStatus(workspace: string, input: CoworkBinding & { request_id: string }) {
  return withCoworkBinding(workspace, input, false, () => {
    if (!/^[a-f0-9-]{36}$/u.test(input.request_id)) throw new Error("cowork-commit-id-invalid");
    const directory = join(commandsRoot(), input.request_id);
    const request = JSON.parse(narrativeFile(directory, "request.json")) as CommandRequest;
    if (request.commitBinding?.workspace !== realpathSync(workspace) || request.commitBinding.taskId !== input.task_id || request.commitBinding.session !== input.session)
      throw new Error("cowork-commit-binding-mismatch");
    const observed = observeCoworkCommit(directory, digest(request));
    let result = observed.receipt?.commitResult ?? null;
    const finalized = join(directory, "commit-finalization.json");
    if (!result && existsSync(finalized)) {
      const saved = JSON.parse(narrativeFile(directory, "commit-finalization.json"));
      if (saved.version !== 1 || saved.requestDigest !== digest(request) || saved.bindingDigest !== digest(request.commitBinding) || !["committed", "not-committed"].includes(saved.result?.status))
        throw new Error("cowork-commit-finalization-mismatch");
      result = saved.result;
    }
    if (result?.status === "committed") verifyCoworkCommitTree(request.commitBinding, result.commit);
    let recovery = null;
    if ((!result && observed.state === "unknown") || result?.status === "recovery-required") {
      let candidate_commit: string | null = null;
      try { candidate_commit = verifyCoworkCommitTree(request.commitBinding, originalCoworkCommit(request.commitBinding)); } catch { /* No verified tree yet. */ }
      recovery = { status: "recovery-required", candidate_commit, preservation: "unverified",
        owner: existsSync(join(directory, "owner.json")) ? "lost" : "not-acknowledged" };
    }
    const output = Object.fromEntries(["stdout", "stderr"].map(name => {
      const path = join(directory, `${name}.log`);
      return [name, coworkLogTail(path)];
    }));
    return { request_id: input.request_id, state: observed.state, result: recovery ?? result, output,
      reason: observed.receipt?.reason ?? null, command_state: observed.receipt?.state ?? null, cleanup: observed.receipt?.cleanup ?? null };
  });
}
