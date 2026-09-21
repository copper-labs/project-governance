import { resolve, relative, isAbsolute } from "node:path";
import { narrativeFile } from "./narrative-inputs.ts";
import { digest, object, text } from "./core.ts";
import { inspectRuntimeBackup } from "./runtime-backup-inspection.ts";
import { MAX_BACKUP_INPUTS, type BackupInput } from "./runtime-backup.ts";

/** Resume from backed source identities, since successful transition writes change the live plan. */
export function backedMigrationInputs(path: string, backupDirectory: string, workspace: string): BackupInput[] {
  const saved = object(JSON.parse(narrativeFile(process.cwd(),path)));
  const {planDigest,...plan}=saved;
  if(plan.version!==1 || plan.kind!=="runtime-migration-project-files" || plan.workspace!==workspace ||
      planDigest!==digest(plan) || !Array.isArray(plan.inputs) || !Array.isArray(plan.sources) ||
      !plan.inputs.length || plan.inputs.length>MAX_BACKUP_INPUTS || plan.inputs.length!==plan.sources.length)
    throw new Error("Invalid backed migration plan");
  const backup=inspectRuntimeBackup(backupDirectory),sources=plan.sources;
  const inputs=plan.inputs.map((raw,index)=>{
    const input=object(raw),source=object(sources[index]);
    const file=text(input.path,"migration input"),rel=relative(workspace,file);
    if(!isAbsolute(file) || resolve(file)!==file || rel===".." || rel.startsWith("../") || isAbsolute(rel) ||
        !["file","absent"].includes(String(input.kind)) || source.path!==rel || source.kind!==input.kind)
      throw new Error("Invalid backed migration input");
    const record=backup.records.map(record=>object(record)).find(record=>record.source===file);
    if(!record || record.kind!==input.kind || record.digest!==source.sourceDigest || record.mode!==source.mode)
      throw new Error("Migration plan differs from verified backup");
    return {path:file,kind:input.kind as "file"|"absent"};
  });
  if(new Set(inputs.map(input=>input.path)).size!==inputs.length)throw new Error("Duplicate backed migration input");
  return inputs;
}
