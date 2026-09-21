import { object, text } from "./core.ts";

/** Historical wheel identity is migration input, never a second active product lock. */
export function legacyRuntimeLock(raw: unknown) {
  const value = object(raw, "legacy runtime lock");
  const required = ["schema_version", "package", "version", "wheel", "sha256", "source_commit", "python", "configuration_schema", "release_base_url"];
  if (required.some(key => !Object.hasOwn(value, key)) || value.schema_version !== 1 || value.package !== "project-governance-runtime") throw new Error("Unsupported legacy runtime lock");
  const version = text(value.version, "legacy version"), wheel = text(value.wheel, "legacy wheel");
  if (!/^\d+\.\d+\.\d+(?:[A-Za-z0-9.+-]*)$/u.test(version) || !/^[A-Za-z0-9][A-Za-z0-9._+-]*\.whl$/u.test(wheel)) throw new Error("Invalid legacy release identity");
  if (typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(value.sha256) || typeof value.source_commit !== "string" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value.source_commit)) throw new Error("Invalid legacy source or artifact digest");
  const url = new URL(text(value.release_base_url, "legacy release source"));
  if (!["https:", "file:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || (url.protocol === "file:" && url.host)) throw new Error("Invalid legacy artifact source");
  if (!Number.isSafeInteger(value.configuration_schema) || Number(value.configuration_schema) < 1) throw new Error("Invalid legacy configuration schema");
  return { schema_version: 1 as const, package: "project-governance-runtime" as const, version, wheel,
    sha256: value.sha256, source_commit: value.source_commit, python: text(value.python, "legacy Python requirement"),
    configuration_schema: Number(value.configuration_schema), release_base_url: value.release_base_url as string };
}
