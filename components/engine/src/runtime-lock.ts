import { object } from "./core.ts";

export interface CompiledRuntimeLock {
  schema_version: 2; package: "@organta/project-governance"; version: string;
  artifact: { url: string; integrity: string };
  source_commit: string; node: ">=24.16.0 <25"; configuration_schema: 1;
}
const version = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u;

/** A deliberate major migration has one exact artifact identity, never a registry tag or a second product lock. */
export function compiledRuntimeLock(value: unknown): CompiledRuntimeLock {
  const lock = object(value, "runtime lock");
  const keys = ["schema_version", "package", "version", "artifact", "source_commit", "node", "configuration_schema"];
  if (Object.keys(lock).length !== keys.length || keys.some(key => !Object.hasOwn(lock, key))) throw new Error("Incomplete or unknown compiled runtime lock fields");
  if (lock["schema_version"] !== 2 || lock["package"] !== "@organta/project-governance" || lock["configuration_schema"] !== 1 || lock["node"] !== ">=24.16.0 <25") throw new Error("Unsupported compiled runtime lock contract");
  if (typeof lock["version"] !== "string" || !version.test(lock["version"])) throw new Error("Runtime version must be exact");
  if (typeof lock["source_commit"] !== "string" || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(lock["source_commit"])) throw new Error("Runtime source must be a full commit identity");
  const artifact = object(lock["artifact"], "runtime artifact");
  if (Object.keys(artifact).length !== 2 || typeof artifact["url"] !== "string" || typeof artifact["integrity"] !== "string") throw new Error("Invalid runtime artifact descriptor");
  const url = new URL(artifact["url"]);
  if (!["https:", "file:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || !url.pathname.endsWith(".tgz") || (url.protocol === "file:" && url.hostname)) throw new Error("Runtime artifact must be an immutable HTTPS or local archive without embedded credentials");
  if (!/^sha512-[A-Za-z0-9+/]{86}==$/u.test(artifact["integrity"]) || Buffer.from(artifact["integrity"].slice(7), "base64").toString("base64") !== artifact["integrity"].slice(7)) throw new Error("Runtime archive requires canonical SHA-512 integrity");
  return structuredClone(lock) as unknown as CompiledRuntimeLock;
}

/** Runtime checks are local and deterministic; they do not download a different Node version. */
export function compatibleNodeVersion(value: string): boolean {
  const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)$/u.exec(value);
  return Boolean(match && Number(match[1]) === 24 && Number(match[2]) >= 16);
}
