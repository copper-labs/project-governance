import { object } from "./core.ts";

function credentialKey(name: string): boolean {
  return name.toUpperCase() === "OPENAI_API_KEY" || /TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE_KEY/iu.test(name);
}

/** Rejection is broader than name-only credential admission; unknown API keys never gain passthrough. */
export function rejectEmbeddedCredentialFields(value: Record<string, unknown>): void {
  if (Object.keys(value).some(name => credentialKey(name) || /(?:^|_)API_KEY$/iu.test(name)))
    throw new Error("credentials cannot be embedded in environment overrides");
}

/** References are policy data; credential values remain only in the launched process environment. */
export function credentialNames(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 16 || new Set(value).size !== value.length ||
      value.some(name => typeof name !== "string" || !/^[A-Z][A-Z0-9_]{0,127}$/u.test(name) ||
        name === "GOVERNANCE_STARTUP_TOKEN" || !credentialKey(name))) throw new Error("Invalid credential environment references");
  return value as string[];
}

/** Ordinary overrides are durable policy data, so credentials must use name-only references. */
export function nonCredentialEnvironment(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  const raw = object(value, "environment"); rejectEmbeddedCredentialFields(raw);
  for (const [name, entry] of Object.entries(raw)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name) || typeof entry !== "string" || entry.includes("\0")) throw new Error("invalid environment entry");
    result[name] = entry;
  }
  return result;
}

export class CredentialUnavailableError extends Error {
  readonly credentialName: string;
  constructor(credentialName: string) {
    super(`Required operation credential unavailable: ${credentialName}`);
    this.credentialName = credentialName;
  }
}

export function credentialEnvironment(names: unknown, options: { required?: boolean } = {}): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of credentialNames(names)) {
    const value = process.env[name];
    if (!value || value.includes("\0")) {
      if (options.required !== false) throw new CredentialUnavailableError(name);
      continue;
    }
    result[name] = value;
  }
  return result;
}
