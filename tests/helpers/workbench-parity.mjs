import { readFileSync } from "node:fs";
import { BpmnModdle } from "bpmn-moddle";
import { freeze } from "./workbench.mjs";

export const corpus = new URL("../fixtures/parity-corpus/", import.meta.url);
export const load = (name) => JSON.parse(readFileSync(new URL(name, corpus), "utf8"));
export const index = load("index.json");
export const config = freeze(load("config.json"));
export const comparators = freeze(load("comparators.json"));
export const manifestHash = "61903a61e2a6f258b506b4cdcd310a57787eee30845d6deb996afbb54abf33a9";
// Pinned shortest round-trip decimals, expanded without exponent notation.
export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  if (typeof value !== "number") return JSON.stringify(value);
  if (!Number.isFinite(value)) throw Error("primitive-type");
  const raw = String(value);
  if (!raw.includes("e")) return raw;
  const [mantissa, exponent] = raw.split("e"), negative = mantissa.startsWith("-");
  const unsigned = negative ? mantissa.slice(1) : mantissa;
  const digits = unsigned.replace(".", ""), point = (unsigned.split(".")[0].length) + Number(exponent);
  return (negative ? "-" : "") + (point <= 0 ? "0." + "0".repeat(-point) + digits : point >= digits.length ? digits + "0".repeat(point - digits.length) : digits.slice(0, point) + "." + digits.slice(point));
}
export const codecConfig = freeze({ contractVersion: config.contractVersion, defaults: "explicit", descriptors: { sem: load("descriptors/semantics.json") } });
export function model() { return new BpmnModdle({ sem: load("descriptors/semantics.json") }); }

// Independent authoring helper, matching the Python lane's explicit reference vocabulary.
// No codec, projection, default expansion, layout or style function prepares F7 inputs.
export function nativeFixture(raw, m = model()) {
  const references = new Set(["incoming", "outgoing", "flowNodeRef", "sourceRef", "targetRef", "laneRef", "primaryAssociationRef", "processRef", "bpmnElement", "dataObjectRef", "dataStoreRef"]);
  const ids = new Map(), pending = [];
  function build(j, parent) {
    const e = m.create(j.$type); e.$parent = parent;
    if (j.id) ids.set(j.id, e);
    for (const [k, v] of Object.entries(j)) {
      if (k === "$type") continue;
      if (k === "$attrs") Object.assign(e.$attrs, v);
      else if (references.has(k)) pending.push([e, k, v]);
      else e.set(k, Array.isArray(v) ? v.map(x => x && typeof x === "object" ? build(x, e) : x) : v && typeof v === "object" ? build(v, e) : v);
    }
    return e;
  }
  const root = build(raw);
  for (const [e, k, v] of pending) e.set(k, Array.isArray(v) ? v.map(id => ids.get(id)) : ids.get(v));
  return root;
}
