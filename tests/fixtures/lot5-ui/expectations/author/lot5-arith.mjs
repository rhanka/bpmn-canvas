// Standalone arithmetic helper for the lot-5 UI expectations. Never imported by
// production code or CI. It imports Node builtins only: no profile loader,
// compiler, evaluator, codec, layout, exporter or command module.
//
// JCS (RFC 8785) is restricted to the value domain these fixtures use:
// null, strings, booleans, finite numbers, arrays and plain objects. Integers
// must be safe, except the exactly representable bound 2^53 of one vendored
// Python negative-test command input (lot5-py-pick-paging-bounds); the only
// non-integers are negative-test command inputs, whose ECMAScript shortest
// rendering is the JCS rendering. Null appears only in Report/2 coordinates and
// negative command inputs; noNull() guards trees/profiles.
import { createHash } from "node:crypto";

export function noNull(value, where = "value") {
  if (value === null) throw new Error(`null in ${where}`);
  if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) noNull(child, `${where}/${key}`);
  return value;
}

export function jcs(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value) && Math.abs(value) !== 2 ** 53)) throw new Error(`unsupported number ${value}`);
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value === "string") {
    for (const scalar of value) {
      const code = scalar.codePointAt(0);
      if (code >= 0xd800 && code <= 0xdfff) throw new Error("lone surrogate");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    // Default sort compares UTF-16 code units, as RFC 8785 requires.
    return `{${Object.keys(value).sort().map(key => `${jcs(key)}:${jcs(value[key])}`).join(",")}}`;
  }
  throw new Error(`unsupported JSON value ${typeof value}`);
}

/** B(bytes): lowercase hex SHA-256 of raw bytes (string input is UTF-8). */
export const B = bytes => createHash("sha256").update(typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes).digest("hex");

/** H(x) = lowercase_hex(SHA256(UTF8(JCS(x)))). */
export const H = value => B(jcs(value));

/** stable-id/1: g_ + H(["profile-mechanism/1", ownerId, slot, stableKey]). */
export function stableId(ownerId, slot, stableKey) {
  for (const part of [ownerId, slot, stableKey]) if (typeof part !== "string") throw new Error("stable-id/1 parts are strings");
  return `g_${H(["profile-mechanism/1", ownerId, slot, stableKey])}`;
}

/** Deep JSON clone for plain data. */
export const clone = value => JSON.parse(JSON.stringify(value));

const sorted = v => Array.isArray(v) ? v.map(sorted)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v;
/** Pretty, key-sorted JSON with a trailing LF; the comparators use JCS bytes. */
export function pretty(value) {
  jcs(value);
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}
/** Key-sorted JSON indented for the first `depth` nesting levels and compact below, with a trailing LF. */
export function prettyShallow(value, depth = 4) {
  jcs(value);
  const write = (v, d) => {
    if (d >= depth || v === null || typeof v !== "object" || (Array.isArray(v) ? !v.length : !Object.keys(v).length)) return JSON.stringify(sorted(v));
    const pad = "  ".repeat(d + 1), end = "  ".repeat(d);
    if (Array.isArray(v)) return `[\n${v.map(x => pad + write(x, d + 1)).join(",\n")}\n${end}]`;
    return `{\n${Object.keys(v).sort().map(k => `${pad}${JSON.stringify(k)}: ${write(v[k], d + 1)}`).join(",\n")}\n${end}}`;
  };
  return `${write(value, 0)}\n`;
}
