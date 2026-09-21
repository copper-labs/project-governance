import { providerBinding, ProviderBindingError, type NativeProvider } from "./provider-binding.ts";

/** Inspect explicit selection and local executability only. No authentication, model or network probes. */
export function providerDoctor(provider: NativeProvider, options: Parameters<typeof providerBinding>[1] = {}, environment: NodeJS.ProcessEnv = process.env) {
  const base = { version: 1, authentication: "not-probed", nativeCapabilities: "not-probed", network: "not-attempted", mutation: "none" };
  try {
    const selected = providerBinding(provider, options, environment);
    return { ...base, status: "passed", availability: "executable-resolved", reason: null, ...selected };
  } catch (error) {
    return { ...base, status: "failed", availability: "not-ready", reason: error instanceof ProviderBindingError ? error.code : "invalid-configuration" };
  }
}
