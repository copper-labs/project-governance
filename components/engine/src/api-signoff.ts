/** Exact API review identities; local host attribution is not authenticated chat identity. */
import { canonical, digest, object, text } from "./core.ts";

export interface ApiSignoffSubject {
  version: 1;
  contractId: string;
  contractDigest: string;
  cells: { product: string; language: string; platform: string }[];
  sections: Record<string, string>;
  reviewDigest: string;
}
export interface ApiSignoffHostObservation {
  kind: "local-native-confirmation" | "local-page-confirmation";
  eventId: string;
  observedAt: string;
  uid: number;
  username: string;
  executable: string;
  nodeVersion: string;
  packageVersion: string;
  packageDigest: string;
  hostExportDigest: string;
  adapterDigest: string;
  lockDigest: string;
}
export interface ApiSignoffPredecessor { id: string; revision: number }
export interface ApiSignoffReceipt {
  kind: "api-signoff-v1";
  id: string;
  repositoryId: string;
  requestId: string;
  subject: ApiSignoffSubject;
  subjectDigest: string;
  host: ApiSignoffHostObservation;
  predecessor: ApiSignoffPredecessor | null;
  createdAt: string;
  envelopeDigest: string;
  revision: number;
  revokedAt: string | null;
  revocation: ApiSignoffHostObservation | null;
  supersededBy: string | null;
}
export interface ApiSignoffLocator { kind: "api-signoff-v1"; id: string; repositoryId: string }

export function signoffFields(value: unknown, keys: string[], label: string): Record<string, unknown> {
  const row = object(value, label);
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key)))
    throw new Error(`Invalid ${label} fields`);
  return row;
}
export function signoffDigest(value: unknown): string {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(value)) throw new Error("Invalid signoff digest");
  return value;
}
export function signoffId(value: unknown): string {
  const id = text(value, "signoff identifier", 160);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/u.test(id)) throw new Error("Invalid signoff identifier");
  return id;
}

/** Normalize sets once so order never broadens scope or causes a second confirmation. */
export function apiSignoffSubject(value: unknown): ApiSignoffSubject {
  const row = signoffFields(value, ["version", "contractId", "contractDigest", "cells", "sections", "reviewDigest"], "API signoff subject");
  if (row.version !== 1 || !Array.isArray(row.cells) || row.cells.length < 1 || row.cells.length > 64)
    throw new Error("Invalid API signoff cells");
  const cells = row.cells.map(value => {
    const cell = signoffFields(value, ["product", "language", "platform"], "API signoff cell");
    return { product: signoffId(cell.product), language: signoffId(cell.language), platform: signoffId(cell.platform) };
  }).sort((a, b) => canonical(a) < canonical(b) ? -1 : canonical(a) > canonical(b) ? 1 : 0);
  if (new Set(cells.map(canonical)).size !== cells.length) throw new Error("Duplicate API signoff cell");
  const entries = Object.entries(object(row.sections, "API signoff sections"));
  if (!entries.length || entries.length > 128) throw new Error("Invalid API signoff sections");
  const sections = Object.fromEntries(entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([id, hash]) => [signoffId(id), signoffDigest(hash)]));
  return { version: 1, contractId: signoffId(row.contractId), contractDigest: signoffDigest(row.contractDigest),
    cells, sections, reviewDigest: signoffDigest(row.reviewDigest) };
}

/** These are host observations, not credentials or proof against another same-account writer. */
export function apiSignoffObservation(value: unknown): ApiSignoffHostObservation {
  const row = signoffFields(value, ["kind", "eventId", "observedAt", "uid", "username", "executable", "nodeVersion",
    "packageVersion", "packageDigest", "hostExportDigest", "adapterDigest", "lockDigest"], "host observation");
  if (!["local-native-confirmation", "local-page-confirmation"].includes(String(row.kind)) || !Number.isSafeInteger(row.uid) || Number(row.uid) < 0 ||
      typeof row.observedAt !== "string" || !Number.isFinite(Date.parse(row.observedAt))) throw new Error("Invalid host observation");
  for (const key of ["eventId", "username", "executable", "nodeVersion", "packageVersion"]) text(row[key], key);
  for (const key of ["packageDigest", "hostExportDigest", "adapterDigest", "lockDigest"]) signoffDigest(row[key]);
  return row as unknown as ApiSignoffHostObservation;
}

export function apiSignoffPredecessor(value: unknown): ApiSignoffPredecessor | null {
  if (value === null) return null;
  const row = signoffFields(value, ["id", "revision"], "signoff predecessor");
  if (!Number.isSafeInteger(row.revision) || Number(row.revision) < 1) throw new Error("Invalid signoff revision");
  return { id: signoffId(row.id), revision: Number(row.revision) };
}

export function apiSignoffEnvelopeDigest(record: Omit<ApiSignoffReceipt, "envelopeDigest"> | ApiSignoffReceipt): string {
  return digest({ kind: record.kind, id: record.id, repositoryId: record.repositoryId, requestId: record.requestId,
    subject: record.subject, subjectDigest: record.subjectDigest, host: record.host,
    predecessor: record.predecessor, createdAt: record.createdAt });
}
