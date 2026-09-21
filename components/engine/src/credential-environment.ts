/** References are policy data; credential values remain only in the launched process environment. */
export function credentialNames(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 16 || new Set(value).size !== value.length ||
      value.some(name => typeof name !== "string" || !/^[A-Z][A-Z0-9_]{0,127}$/u.test(name) ||
        !/(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE_KEY)/u.test(name))) throw new Error("Invalid credential environment references");
  return value as string[];
}

export function credentialEnvironment(names: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of credentialNames(names)) {
    const value = process.env[name];
    if (!value || value.includes("\0")) throw new Error(`Required operation credential unavailable: ${name}`);
    result[name] = value;
  }
  return result;
}
