import { hasConfirmedCommandCleanup } from "./command-owner-recovery.ts";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { canonical, digest, object } from "./core.ts";
import { observeCommand, type CommandRequest } from "./process-owner.ts";
import { ResourceRegistry, type Lease } from "./resources.ts";

/** Reconcile only an already published cleanup proof. Missing evidence never causes execution or lease theft. */
export function reconcileCommandClaims(directory: string, requestDigest: string): void {
  directory = resolve(directory);
  const read = (name: string) => {
    const path = join(directory, name);
    if (statSync(path).size > 8 * 1024 * 1024) throw new Error("Oversized command claim evidence");
    return object(JSON.parse(readFileSync(path, "utf8")));
  };
  const request = read("request.json") as unknown as CommandRequest;
  if (request.version !== 1 || digest(request) !== requestDigest || !request.coordination) throw new Error("Command claim request mismatch");
  const result = observeCommand(directory, requestDigest);
  if (result.state !== "terminal" || !result.receipt || !hasConfirmedCommandCleanup(directory, result.receipt)) throw new Error("Confirmed command cleanup required");
  const record = read("claims.json");
  if (record.requestDigest !== requestDigest || !Array.isArray(record.leases) || !record.leases.length) throw new Error("Command lease record mismatch");
  const leases = record.leases as Lease[];
  if (leases.some(lease => lease.owner !== requestDigest || lease.operation !== requestDigest || !Number.isSafeInteger(lease.generation) || lease.generation < 1) ||
      canonical(leases.map(lease => lease.resource).sort()) !== canonical([...new Set(request.coordination.resources)].sort())) throw new Error("Command lease scope mismatch");
  const registry = new ResourceRegistry(request.coordination.registry);
  try {
    if (registry.path !== record.registry) throw new Error("Command lease registry mismatch");
    registry.release(leases, digest(result.receipt));
  } finally { registry.close(); }
}
