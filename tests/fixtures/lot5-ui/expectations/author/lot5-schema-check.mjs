// Standalone JSON Schema 2020-12 SUBSET checker used only as an INPUT/SHAPE
// self-check of the lot-5 fixtures and expected records (non-evidence: it
// produces no expected value). It implements exactly the closed keyword set of
// DESIGN §2.1 L52 that the pinned public schemas use, with Node builtins only:
// no loader, compiler, evaluator, codec, layout, exporter or command import.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const ANNOTATIONS = new Set(["$schema", "$id", "$comment", "title", "$defs"]);
const KEYWORDS = new Set([...ANNOTATIONS, "$ref", "type", "properties", "required", "additionalProperties", "items", "minItems", "maxItems",
  "uniqueItems", "minLength", "pattern", "enum", "const", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "allOf", "anyOf",
  "oneOf", "not", "if", "then", "else"]);

/** Read a pinned schema file; refuse when its raw SHA-256 differs from the pin. */
export function loadPinnedSchema(url, sha256) {
  const bytes = readFileSync(url);
  if (createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error(`schema pin mismatch ${url}`);
  return JSON.parse(bytes.toString("utf8"));
}

const canon = v => v === null || typeof v !== "object" ? JSON.stringify(v)
  : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
const typeOf = v => v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v;
const typeMatches = (want, v) => [].concat(want).some(t => t === typeOf(v) || (t === "number" && typeOf(v) === "integer"));
const escape = s => s.replace(/~1/g, "/").replace(/~0/g, "~");
const regexCache = new Map();

/** Validate value against schema (root resolves local "#/..." references). Returns error strings. */
export function validate(schema, value, root = schema, path = "") {
  if (schema === true) return [];
  if (schema === false) return [`${path || "/"}: false schema`];
  const errors = [];
  for (const k of Object.keys(schema)) if (!KEYWORDS.has(k)) throw new Error(`unsupported keyword ${k}`);
  if (schema.$ref !== undefined) {
    if (!schema.$ref.startsWith("#")) throw new Error(`external $ref ${schema.$ref}`);
    let target = root;
    for (const part of schema.$ref.slice(1).split("/").filter(Boolean)) {
      target = target[escape(part)];
      if (target === undefined) throw new Error(`unresolved $ref ${schema.$ref}`);
    }
    errors.push(...validate(target, value, root, path));
  }
  if (schema.type !== undefined && !typeMatches(schema.type, value)) return [...errors, `${path || "/"}: type ${typeOf(value)} not ${schema.type}`];
  if (schema.const !== undefined && canon(schema.const) !== canon(value)) errors.push(`${path || "/"}: const`);
  if (schema.enum !== undefined && !schema.enum.some(e => canon(e) === canon(value))) errors.push(`${path || "/"}: enum`);
  if (typeof value === "string") {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) errors.push(`${path}: minLength`);
    if (schema.pattern !== undefined) {
      if (!regexCache.has(schema.pattern)) regexCache.set(schema.pattern, new RegExp(schema.pattern, "u"));
      if (!regexCache.get(schema.pattern).test(value)) errors.push(`${path}: pattern ${schema.pattern}`);
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: maximum`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) errors.push(`${path}: exclusiveMinimum`);
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) errors.push(`${path}: exclusiveMaximum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: minItems`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: maxItems`);
    if (schema.uniqueItems === true && new Set(value.map(canon)).size !== value.length) errors.push(`${path}: uniqueItems`);
    if (schema.items !== undefined) value.forEach((item, i) => errors.push(...validate(schema.items, item, root, `${path}/${i}`)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) errors.push(`${path}: required ${key}`);
    for (const [key, child] of Object.entries(value)) {
      if (schema.properties && Object.hasOwn(schema.properties, key)) errors.push(...validate(schema.properties[key], child, root, `${path}/${key}`));
      else if (schema.additionalProperties !== undefined) errors.push(...validate(schema.additionalProperties, child, root, `${path}/${key}`));
    }
  }
  for (const sub of schema.allOf ?? []) errors.push(...validate(sub, value, root, path));
  if (schema.anyOf && !schema.anyOf.some(sub => validate(sub, value, root, path).length === 0)) errors.push(`${path || "/"}: anyOf`);
  if (schema.oneOf) {
    const matches = schema.oneOf.filter(sub => validate(sub, value, root, path).length === 0).length;
    if (matches !== 1) errors.push(`${path || "/"}: oneOf matched ${matches}`);
  }
  if (schema.not !== undefined && validate(schema.not, value, root, path).length === 0) errors.push(`${path || "/"}: not`);
  if (schema.if !== undefined) {
    const branch = validate(schema.if, value, root, path).length === 0 ? schema.then : schema.else;
    if (branch !== undefined) errors.push(...validate(branch, value, root, path));
  }
  return errors;
}
