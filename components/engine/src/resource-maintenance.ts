import { parseArgs } from "node:util";
import { lstatSync } from "node:fs";
import { ResourceRegistry } from "./resources.ts";
import { text } from "./core.ts";

/** Explicit migration of an existing drained registry; never initializes a replacement registry. */
export function resourceMaintenance(args: string[]) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    registry: { type: "string" }, authority: { type: "string" }, "from-protocol": { type: "string" },
  } });
  const path = text(values.registry, "resource registry"), authority = text(values.authority, "migration authority");
  if (values["from-protocol"] !== "1") throw new Error("Resource maintenance supports explicit protocol 1 to 2 migration only");
  if (!lstatSync(path).isFile()) throw new Error("Resource maintenance requires an existing ordinary registry file");
  const registry = new ResourceRegistry(path, { migrateFromProtocol1: true, authority });
  try { return { state: "compatible", protocol: 2, registry: registry.path, hostId: registry.hostId }; }
  finally { registry.close(); }
}
