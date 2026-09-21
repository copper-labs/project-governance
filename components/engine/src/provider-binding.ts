import { accessSync, constants, readFileSync, realpathSync, statSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { object } from "./core.ts";
const EXECUTABLES = { claude: "claude", codex: "codex", gemini: "agy" };
export type NativeProvider = keyof typeof EXECUTABLES;
export class ProviderBindingError extends Error {
  readonly code: "invalid-provider" | "missing-model" | "missing-effort" | "invalid-selection" | "executable-unavailable";
  constructor(code: ProviderBindingError["code"], message: string) { super(message); this.code = code; }
}

/** Resolve operator choices without a model catalog, role routing, shell evaluation or fallback model. */
export function providerBinding(provider: NativeProvider, options: { model?: string; effort?: string; executable?: string; config?: string } = {}, environment: NodeJS.ProcessEnv = process.env) {
  if (!Object.hasOwn(EXECUTABLES, provider)) throw new ProviderBindingError("invalid-provider", "Provider must be gemini, claude, or codex");
  let defaults: Record<string, unknown> = {};
  if (options.config) {
    if (statSync(options.config).size > 65536) throw new Error("Provider configuration exceeds 64 KiB");
    const config = object(JSON.parse(readFileSync(options.config, "utf8")));
    if (config.version !== 1) throw new Error("Provider configuration requires version 1");
    const providers = object(config.providers);
    defaults = Object.hasOwn(providers, provider) ? object(providers[provider]) : {};
    if (Object.keys(defaults).some(key => !["model", "effort", "executable"].includes(key))) throw new Error("Provider binding accepts only model, effort, and executable");
  }
  const model = options.model || defaults.model, effort = options.effort || defaults.effort;
  for (const [name, value] of [["model", model], ["effort", effort]]) {
    if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u.test(value)) throw new ProviderBindingError(name === "model" ? "missing-model" : "missing-effort", `An explicit ${name} is required`);
  }
  if (provider === "gemini") {
    const suffix = /-(low|medium|high)$/u.exec(model as string);
    if (!["low", "medium", "high"].includes(effort as string) || (suffix && suffix[1] !== effort)) throw new ProviderBindingError("invalid-selection", "Gemini model suffix and low/medium/high effort must agree");
  }
  const command = options.executable || defaults.executable || EXECUTABLES[provider];
  if (typeof command !== "string" || command.includes("\0")) throw new ProviderBindingError("invalid-selection", "Executable must be one path, not shell arguments");
  const candidates = isAbsolute(command) || command.includes("/") || command.includes("\\") ? [resolve(command)]
    : (environment.PATH ?? "").split(delimiter).filter(Boolean).map(directory => resolve(join(directory, command)));
  for (const candidate of candidates) {
    try {
      if (!statSync(candidate).isFile()) continue;
      accessSync(candidate, constants.X_OK);
      return { provider, model: model as string, effort: effort as string, backend: realpathSync(candidate) };
    } catch { /* Search the next native executable; never change provider or model. */ }
  }
  throw new ProviderBindingError("executable-unavailable", "Selected provider executable is unavailable; install and authenticate it first");
}
