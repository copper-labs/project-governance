import { posix } from "node:path";

/** The engine resolves plan declarations; continuity retains only their exact identity. */
export interface PlanReference {
    version: 1;
    path: string;
    batch: string;
    definition_digest: string;
}

export function parsePlanReference(value: unknown): PlanReference {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("invalid plan reference");
    const reference = value as Record<string, unknown>;
    const fields = ["version", "path", "batch", "definition_digest"];
    if (Object.keys(reference).length !== fields.length || Object.keys(reference).some(key => !fields.includes(key))
        || reference["version"] !== 1)
        throw new Error("invalid plan reference fields or version");
    const path = reference["path"], batch = reference["batch"], definition = reference["definition_digest"];
    if (typeof path !== "string" || Buffer.byteLength(path) > 4096 || !/^docs\/exec-plans\/.+\.md$/u.test(path)
        || /[\\\u0000-\u001f\u007f]/u.test(path) || path.split("/").includes("..") || posix.normalize(path) !== path)
        throw new Error("plan reference requires a safe structured-plan path");
    if (typeof batch !== "string" || batch.length > 100 || !/^[A-Za-z][A-Za-z0-9._-]*$/u.test(batch))
        throw new Error("invalid plan reference batch");
    if (typeof definition !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(definition))
        throw new Error("invalid plan reference definition digest");
    return { version: 1, path, batch, definition_digest: definition };
}
