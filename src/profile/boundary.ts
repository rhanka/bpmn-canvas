import { canonicalize } from "./canonical.js";
import { failContract } from "./native-contracts.js";

export type JsonRecord = Record<string, unknown>;
export function record(value: unknown, required: readonly string[], optional: readonly string[] = [], code?: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) failContract(code);
  const r = value as JsonRecord;
  if (required.some(k => !Object.hasOwn(r, k)) || Object.keys(r).some(k => !required.includes(k) && !optional.includes(k))) failContract(code);
  return r;
}
export function text(value: unknown, empty = false): asserts value is string {
  if (typeof value !== "string" || (!empty && value.length === 0)) failContract();
}
export function array(value: unknown): asserts value is unknown[] { if (!Array.isArray(value)) failContract(); }
export function digest(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) failContract();
}
export function choice(value: unknown, values: readonly unknown[]): void { if (!values.includes(value)) failContract(); }
export const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export const equal = (a: unknown, b: unknown): boolean => canonicalize(a) === canonicalize(b);
export function noNull(value: unknown): void {
  if (value === null) failContract();
  if (value && typeof value === "object") for (const child of Object.values(value)) noNull(child);
}
export function validateIdentity(value: unknown): void {
  const r = record(value, ["mechanismVersion", "schemaVersion", "profile", "version", "sha256", "base", "descriptors"]);
  choice(r.mechanismVersion, ["1"]); choice(r.schemaVersion, ["1.0.0"]);
  text(r.profile); text(r.version); digest(r.sha256);
  if (!/^[A-Za-z_][A-Za-z0-9_.:/-]*$/.test(r.profile) || !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(r.version)) failContract();
  validatePin(r.base); array(r.descriptors);
  if (r.descriptors.length === 0) failContract("descriptor-mismatch");
  const ids = new Set<string>();
  for (const p of r.descriptors) { validatePin(p); const id = (p as JsonRecord).id as string; if (ids.has(id)) failContract("descriptor-mismatch"); ids.add(id); }
}
export function validatePin(value: unknown): void {
  const p = record(value, ["id", "version", "sha256"]); text(p.id); text(p.version); digest(p.sha256);
}
