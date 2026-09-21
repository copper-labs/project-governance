import { isoDate } from "../schema-validation.ts";
export const dayMicroseconds = 86_400_000_000n;
/** Preserve microsecond boundaries used by release-age and end-of-date override checks. */
export function dependencyMoment(value: unknown, field: string, endOfDate = false): bigint {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be an ISO date or timezone-aware timestamp`);
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(text)) {
    if (!isoDate(text)) throw new Error(`${field} has an invalid calendar date`);
    return BigInt(Date.parse(`${text}T00:00:00Z`)) * 1000n + (endOfDate ? dayMicroseconds - 1n : 0n);
  }
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?(Z|[+-]\d{2}:\d{2})$/u.exec(text);
  if (!match || !isoDate(match[1]!)) throw new Error(`${field} must be an ISO date or timezone-aware timestamp`);
  const hour = Number(match[2]), minute = Number(match[3]), second = Number(match[4] ?? 0), zone = match[6]!;
  if (hour > 23 || minute > 59 || second > 59) throw new Error(`${field} has an invalid time`);
  let offset = 0;
  if (zone !== "Z") {
    const hours = Number(zone.slice(1, 3)), minutes = Number(zone.slice(4));
    if (hours > 23 || minutes > 59) throw new Error(`${field} has an invalid timezone`);
    offset = (hours * 60 + minutes) * (zone.startsWith("-") ? -1 : 1);
  }
  return BigInt(Date.parse(`${match[1]}T00:00:00Z`)) * 1000n + BigInt(hour * 3600 + minute * 60 + second - offset * 60) * 1_000_000n + BigInt((match[5] ?? "").padEnd(6, "0"));
}
