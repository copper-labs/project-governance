import { realpathSync } from "node:fs";
import { digest } from "./core.ts";
import { inspectLegacyHistoryArchive } from "./legacy-history-archive.ts";
import { RuntimeGenerations } from "./runtime-generations.ts";

export interface LegacyHistoryRequirement { directory:string; receiptDigest:string }

export function verifyLegacyHistory(workspace:string, history:LegacyHistoryRequirement) {
  const directory=realpathSync(history.directory), observed=inspectLegacyHistoryArchive(directory,history.receiptDigest);
  workspace=realpathSync(workspace);
  if (observed.workspace !== workspace) throw new Error("Legacy history belongs to another workspace");
  return digest({workspace,directory,receiptDigest:observed.receiptDigest});
}

/** Register before installation writes so interrupted migration cannot skip retained-history proof. */
export function requireLegacyHistory(registry:string,workspace:string,token:string,owner:string,history:LegacyHistoryRequirement) {
  const identity=verifyLegacyHistory(workspace,history);
  const generations=new RuntimeGenerations(realpathSync(registry));
  try { generations.requireCompletion(token,owner,"legacyHistoryDigest",identity); }
  finally { generations.close(); }
  return identity;
}
