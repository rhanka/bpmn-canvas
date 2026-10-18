import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { semanticDescriptor } from "../../dist/io/index.js";

export function freeze(value, seen = new Set()) {
  if (value && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    for (const v of Object.values(value)) freeze(v, seen);
    Object.freeze(value);
  }
  return value;
}
export const configuration = freeze({ contractVersion: "1", defaults: "explicit", descriptors: { sem: structuredClone(semanticDescriptor) } });
export const localJson = () => JSON.parse(readFileSync(new URL("../fixtures/io/workbench/local-model.json", import.meta.url), "utf8"));
export const canon = (value) => JSON.stringify(sort(value));
function sort(v) {
  if (Array.isArray(v)) return v.map(sort);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]));
  return v;
}
export const hash = (value) => createHash("sha256").update(typeof value === "string" || value instanceof Uint8Array ? value : canon(value)).digest("hex");
// Captures the complete native own graph, descriptors and reference identity without XML or F1.
export function snapshot(model) {
  const seen = new Map();
  function visit(v) {
    if (!v || typeof v !== "object") return v;
    if (seen.has(v)) return { objectRef: seen.get(v) };
    const ordinal = seen.size;
    seen.set(v, ordinal);
    if (Array.isArray(v)) return { ordinal, array: v.map(visit) };
    return { ordinal, properties: Object.fromEntries(Object.getOwnPropertyNames(v).sort().filter((k) => k !== "$model").map((k) => [k, visit(v[k])])) };
  }
  return canon(visit(model));
}
