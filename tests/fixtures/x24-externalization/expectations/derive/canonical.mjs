// x24 derivation helper: canonical JSON (object keys sorted by UTF-16 code units, no whitespace,
// ECMAScript number and string serialisation) and its SHA-256. Values used here are strings, booleans,
// arrays, objects and finite numbers whose ECMAScript form is also their RFC 8785 form.
import { createHash } from "node:crypto";

export function canonical(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
}

export const canonicalSha256 = (value) => createHash("sha256").update(canonical(value), "utf8").digest("hex");
