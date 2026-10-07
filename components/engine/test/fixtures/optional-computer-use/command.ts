import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { availability, HoloClient, PilotFailure, type HoloFetch } from "./holo.ts";

/** Caller-owned selected check. No configuration read occurs when disabled or unconfigured. */
export async function selectedCheck(options: { runId: string; required: boolean; enabled: boolean; config?: unknown;
  operation: "inspect" | "readiness" | "smoke"; screenshot?: Buffer; target?: string; transport?: HoloFetch; signal?: AbortSignal }) {
  if (!options.enabled || options.config === undefined) return availability(options.runId, options.required, options.enabled ? "unconfigured" : "disabled");
  let client: HoloClient;
  try { client = new HoloClient(options.config, options.transport); }
  catch { return availability(options.runId, options.required, "configuration-invalid", true); }
  try {
    const observation = options.operation === "inspect" ? client.inspect() : options.operation === "readiness" ? await client.readiness(options.signal) :
      options.screenshot && options.target ? { point: await client.ground(options.screenshot, options.target, options.signal),
        observedModel: client.config.model, loadedWeightsVerified: false, imageSupportVerified: true, groundingAccuracyQualified: false } : null;
    if (observation === null) return availability(options.runId, options.required, "configuration-invalid", true);
    return { exitCode: 0, envelope: { status: "passed", findings: [], coverage: options.operation, run_id: options.runId, observation } };
  } catch (error) { return availability(options.runId, options.required, error instanceof PilotFailure ? error.reason : "service-unavailable"); }
}

export async function main(argv: string[]) {
  const allowed = new Set(["--run-id", "--config", "--mode", "--screenshot", "--target", "--required", "--disabled"]);
  const values = new Map<string, string>();
  try {
    for (let i = 0; i < argv.length; i++) {
      const name = argv[i]!;
      if (!allowed.has(name) || values.has(name)) throw new PilotFailure("configuration-invalid");
      if (name === "--required" || name === "--disabled") values.set(name, "true");
      else { const value = argv[++i]; if (!value || value.startsWith("--")) throw new PilotFailure("configuration-invalid"); values.set(name, value); }
    }
    const runId = values.get("--run-id") ?? "selected-computer-use", mode = values.get("--mode") ?? "inspect";
    if (!["inspect", "readiness", "smoke"].includes(mode) || !/^[A-Za-z0-9_-]{1,80}$/u.test(runId)) throw new PilotFailure("configuration-invalid");
    const enabled = !values.has("--disabled"), configPath = values.get("--config"), screenshotPath = values.get("--screenshot");
    const result = await selectedCheck({ runId, required: values.has("--required"), enabled, operation: mode as "inspect" | "readiness" | "smoke",
      ...(enabled && configPath ? { config: JSON.parse(readFileSync(configPath, "utf8")) } : {}),
      ...(enabled && screenshotPath ? { screenshot: readFileSync(screenshotPath) } : {}), ...(values.has("--target") ? { target: values.get("--target")! } : {}) });
    process.stdout.write(JSON.stringify(result.envelope) + "\n"); process.exitCode = result.exitCode;
  } catch { const result = availability("selected-computer-use", true, "configuration-invalid", true);
    process.stdout.write(JSON.stringify(result.envelope) + "\n"); process.exitCode = 1; }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
