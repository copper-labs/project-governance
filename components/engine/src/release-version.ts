import { readFileSync } from "node:fs";
import { object, text } from "./core.ts";

// Source and compiled entry points both sit three levels below the package manifest.
const manifest = object(JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")));
export const RELEASE_VERSION = text(manifest.version, "package version");
