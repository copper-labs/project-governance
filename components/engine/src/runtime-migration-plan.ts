import { continuityMigrationInventory } from "./continuity-migration-inventory.ts";
import { PROJECT_DEFAULTS } from "./runtime-project-defaults.ts";
import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { createHash } from "node:crypto";
import { hostInstructionBackupScope } from "./host-instruction-backup.ts";
import { COMPILED_HOST_BLOCK } from "./provider-guidance.ts";
import { worktreeBytes } from "./change-subject.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { digest, object, text } from "./core.ts";
import { MAX_BACKUP_INPUTS, type BackupInput } from "./runtime-backup.ts";

/** Discover declared project files only; external stores and live owners require separate inventory. */
export function runtimeMigrationPlan(workspace: string) {
  workspace = realpathSync(workspace);
  const host = hostInstructionBackupScope(workspace, COMPILED_HOST_BLOCK);
  const paths = new Map<string, BackupInput>(host.inputs.map(input => [input.path, input]));
  const add = (path: string) => {
    paths.set(path, { path, kind: "file" });
    if (paths.size > MAX_BACKUP_INPUTS) throw new Error("Migration file scope exceeds one bounded backup; partition the declared migration explicitly");
  };
  let visited = 0;
  const walk = (path: string, depth: number) => {
    if (++visited > 512) throw new Error("Migration discovery exceeds entry limit");
    if (depth > 12) throw new Error("Migration configuration nesting exceeds limit");
    let stat;
    try { stat = lstatSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    if (stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error("Migration configuration must not use aliases");
    if (stat.isFile()) { add(path); return; }
    if (!stat.isDirectory()) throw new Error("Unsupported migration configuration entry");
    const names = readdirSync(path).sort();
    if (names.length > 256) throw new Error("Migration configuration directory exceeds discovery limit");
    for (const name of names) walk(join(path, name), depth + 1);
  };
  for (const path of ["config/governance", "config/validation", "config/policies", ".githooks", ".github/workflows"]) walk(join(workspace, path), 0);
  // Native lifecycle configuration is part of cutover scope, including files currently absent.
  // Record individual integration files without sweeping unrelated provider state or credentials.
  const nativeIntegrationPaths=[".codex/hooks.json",".codex/config.toml",".claude/settings.json",
    ".claude/settings.local.json",".gemini/settings.json","tools/governance-startup.py","tools/governance-bootstrap.py"];
  for(const name of nativeIntegrationPaths) {
    const path=join(workspace,name),parent=dirname(path),parentEntry=lstatSync(parent,{throwIfNoEntry:false});
    if(parentEntry && (!parentEntry.isDirectory() || realpathSync(parent)!==parent))
      throw new Error("Native integration directory must be canonical");
    const entry=lstatSync(path,{throwIfNoEntry:false});
    if(entry) {
      if(!entry.isFile() || realpathSync(path)!==path)throw new Error("Native integration must be an ordinary canonical file");
      add(path);
    }else paths.set(path,{path,kind:"absent"});
  }
  const runtimeEntrypoints: Array<{path:string; disposition:string}> = [];
  for (const [name,disposition] of [["project-governance","replace"],["harness-agent","retire-after-qualified-cutover"]]) {
    const path = join(workspace,".governance/runtime/bin",name!);
    let stat;
    try { stat=lstatSync(path); } catch(error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error("Migration runtime entrypoint must be an ordinary canonical file");
    add(path); runtimeEntrypoints.push({path:relative(workspace,path),disposition:disposition!});
  }
  for (const name of ["config/governance/runtime.lock.yaml", ".governance/runtime/bin/project-governance", ...Object.keys(PROJECT_DEFAULTS)]) {
    const path=join(workspace,name);
    try { const entry=lstatSync(path); if(!entry.isFile() || realpathSync(path)!==path)throw new Error("Migration target must be an ordinary canonical file"); add(path); }
    catch(error) {
      if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;
      paths.set(path,{path,kind:"absent"});
    }
  }
  const inputs = [...paths.values()].sort((a,b) => a.path.localeCompare(b.path));
  if(inputs.length>MAX_BACKUP_INPUTS)throw new Error("Migration file scope exceeds one bounded backup");
  const sources = inputs.map(input => {
    if (input.kind === "absent") return { path: relative(workspace,input.path), kind: "absent", sourceDigest: null, mode: null };
    const captured = worktreeBytes(workspace, relative(workspace,input.path), 16 * 1024 * 1024);
    if (captured.type !== "regular") throw new Error("Migration source changed type");
    return { path: relative(workspace,input.path), kind: "file", sourceDigest: `sha256:${createHash("sha256").update(captured.bytes).digest("hex")}`, mode: lstatSync(input.path).mode & 0o777 };
  });
  const plan = { version: 1, kind: "runtime-migration-project-files", workspace, inputs, sources,
    hostPlan: host.plan, hostPlanDigest: host.planDigest, runtimeEntrypoints,
    continuity: continuityMigrationInventory(workspace),
    scope: "declared-project-files-only", unresolvedInventory: ["external-runtime-stores-and-artifacts", "legacy-live-owners", "effective-shared-git-hooks", "native-hook-trust-and-legacy-handler-transition", "installed-launcher-and-runtime"] };
  return { ...plan, planDigest: digest(plan) };
}


/** Re-discover rather than trusting paths supplied in a saved plan. */
export function readCurrentMigrationPlan(path: string, expectedDigest?: string) {
  const saved = object(JSON.parse(narrativeFile(process.cwd(), path)));
  const current = runtimeMigrationPlan(text(saved.workspace, "migration workspace"));
  if (digest(saved) !== digest(current)) throw new Error("Migration project-file plan changed; regenerate before backup");
  if (expectedDigest !== undefined && current.planDigest !== expectedDigest)
    throw new Error("Migration project-file plan replaced during backup");
  return current;
}
