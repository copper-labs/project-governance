import { hasConfirmedCommandCleanup } from "./command-owner-recovery.ts";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { digest, object } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { observeCommand, type CommandRequest } from "./process-owner.ts";
import { reconcileCommandClaims } from "./command-claim-recovery.ts";
import { releaseRuntimeReader, type RuntimeReader } from "./runtime-reader.ts";

/** Release retained obligations only after the original cleanup or bound recovery evidence confirms cleanup. */
export function reconcileCommand(directory: string, requestDigest: string) {
  directory = resolve(directory);
  const request = object(JSON.parse(narrativeFile(directory, "request.json"))) as unknown as CommandRequest;
  if (request.version !== 1 || digest(request) !== requestDigest) throw new Error("Command recovery request mismatch");
  const observation = observeCommand(directory, requestDigest);
  if (observation.state !== "terminal" || !observation.receipt || !hasConfirmedCommandCleanup(directory, observation.receipt)) throw new Error("Original confirmed cleanup required for command recovery");
  if (request.coordination) {
    if (existsSync(join(directory, "claims.json"))) reconcileCommandClaims(directory, requestDigest);
    else if (observation.receipt.reason !== "resource-admission-failed") throw new Error("Command lease evidence missing");
  }
  if (request.runtime) {
    if (!existsSync(request.runtime.registry)) throw new Error("Command runtime registry missing");
    const record = object(JSON.parse(narrativeFile(directory, "generation.json")));
    const reader = object(record.reader) as unknown as RuntimeReader;
    if (record.requestDigest !== requestDigest || reader.owner !== `command:${requestDigest}` ||
        reader.registry !== request.runtime.registry || reader.revision !== request.runtime.revision ||
        reader.directory !== request.runtime.directory || typeof reader.token !== "string" || !reader.token) throw new Error("Command runtime reservation mismatch");
    releaseRuntimeReader(reader, true);
  }
  return { state: "reconciled", requestDigest, receiptDigest: digest(observation.receipt), cleanup: "confirmed",
    cleanupSource: observation.receipt.cleanup === "confirmed" && observation.receipt.reason !== "owner-lost" ? "execution-receipt" : "recovery-evidence" };
}
