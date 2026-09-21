import { object } from "./core.ts";

export function permissionDenied(value: unknown): boolean {
  if (Array.isArray(value)) value = value.length === 1 && value[0] && typeof value[0] === "object" ? value[0].text : null;
  if (value && typeof value === "object") {
    const error = object(value);
    if (["PERMISSION_DENIED", "ACCESS_DENIED"].includes(String(error.code))) return true;
    value = error.message;
  }
  return typeof value === "string" && /^(?:Error:\s*)?(?:(?:permissions?|access)\s+(?:(?:was|is)\s+)?denied|auto[- ]denied|PERMISSION_DENIED|ACCESS_DENIED)(?:[.!]|:[^\r\n]*)?$/iu.test(value.trim());
}
