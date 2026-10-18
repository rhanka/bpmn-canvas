import { canonicalize, checkUnicode, ProfileContractError, rawDigest } from "./canonical.js";

export interface ParseLimits {
  readonly maxBytes: number;
  readonly maxDepth: number;
  readonly maxNodes: number;
}

export const defaultParseLimits: ParseLimits = Object.freeze({ maxBytes: 1_048_576, maxDepth: 256, maxNodes: 100_000 });

/** R3.2 source-order diagnostics, followed by the whole-text JSON grammar check.
 * The walk deliberately admits ECMAScript whitespace; the final parse restricts
 * it to JSON whitespace after earlier lexical failures have had their turn.
 */
export function parseProfileText(text: string, limits: ParseLimits = defaultParseLimits): unknown {
  const fail = (code = "profile-json"): never => { throw new ProfileContractError(code); };
  if (Object.values(limits).some(n => !Number.isSafeInteger(n) || n < 1)) fail("resource-limit");
  if (new TextEncoder().encode(text).length > limits.maxBytes) fail("resource-limit");
  let cursor = 0, nodes = 0;
  const whitespace = (): void => { while (cursor < text.length && /\s/.test(text[cursor]!)) cursor++; };
  const take = (token: string): void => { if (text[cursor++] !== token) fail(); };
  function string(): string {
    const start = cursor;
    take('"');
    let closed = false;
    while (cursor < text.length) {
      const char = text[cursor++];
      if (char === "\\") cursor++;
      else if (char === '"') { closed = true; break; }
    }
    if (!closed) fail();
    let decoded: string;
    try { decoded = JSON.parse(text.slice(start, cursor)) as string; } catch { return fail(); }
    checkUnicode(decoded);
    return decoded;
  }
  function value(depth: number): void {
    if (depth > limits.maxDepth || ++nodes > limits.maxNodes) fail("resource-limit");
    whitespace();
    const char = text[cursor];
    if (char === '"') { string(); return; }
    if (char === "{") {
      cursor++;
      whitespace();
      const keys = new Set<string>();
      if (text[cursor] !== "}") {
        while (true) {
          whitespace();
          if (text[cursor] !== '"') fail();
          const key = string();
          if (keys.has(key)) fail("profile-json-duplicate-key");
          keys.add(key);
          whitespace(); take(":"); value(depth + 1); whitespace();
          if (text[cursor] !== ",") break;
          cursor++;
        }
      }
      take("}"); return;
    }
    if (char === "[") {
      cursor++; whitespace();
      if (text[cursor] !== "]") {
        while (true) {
          value(depth + 1); whitespace();
          if (text[cursor] !== ",") break;
          cursor++;
        }
      }
      take("]"); return;
    }
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, cursor)) { cursor += literal.length; return; }
    }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(cursor));
    if (!number) fail();
    const converted = Number(number![0]);
    if (!Number.isFinite(converted) || (Number.isInteger(converted) && !Number.isSafeInteger(converted))) fail("profile-number");
    cursor += number![0].length;
  }
  value(0); whitespace();
  if (cursor !== text.length) fail();
  try { return JSON.parse(text); } catch { return fail(); }
}

type RecordValue = Record<string, unknown>;
type Schema = boolean | RecordValue;
export interface SchemaOutcome { readonly valid: boolean; readonly keyword?: string }
export type SchemaValidator = (value: unknown) => SchemaOutcome;
export interface PinnedSchema { readonly bytes: Uint8Array; readonly sha256: string }

const keywords = new Set([
  "$schema", "$id", "$comment", "title", "$defs", "$ref", "type", "properties", "required", "additionalProperties",
  "items", "minItems", "maxItems", "uniqueItems", "minLength", "pattern", "enum", "const", "minimum", "maximum",
  "exclusiveMinimum", "exclusiveMaximum", "allOf", "anyOf", "oneOf", "not", "if", "then", "else"
]);
const patterns = new Set([
  "^[A-Za-z_][A-Za-z0-9_.:/-]*$",
  "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$",
  "^[a-z]{2}(?:-[A-Z]{2})?$", "^[0-9a-f]{64}$", "^[A-Za-z_][A-Za-z0-9_]*$",
  "^(?:/(?:[^~/]|~[01])*)*$",
  "^(?:bpmnlint:recommended|plugin:[A-Za-z_][A-Za-z0-9_.-]*/[A-Za-z_][A-Za-z0-9_.-]*)$",
  "^[A-Za-z_][A-Za-z0-9_.:/-]*/[1-9][0-9]*$"
]);
const own = (object: object, key: string): boolean => Object.hasOwn(object, key);
const record = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const refusal = (code: string): never => { throw new ProfileContractError(code); };

/** Closed schema-subset validator. No resolver, filesystem, network, defaults,
 * coercion or executable extension point. Registry bytes are explicitly pinned.
 * This validates syntax only; it is not the production static compiler.
 */
export async function compileSchema(input: unknown, registry: readonly PinnedSchema[] = []): Promise<SchemaValidator> {
  // Copy only JSON data; never execute an accessor or toJSON callback.
  const root = JSON.parse(canonicalize(input)) as Schema;
  const documents = new Map<string, Schema>();
  const roots: Schema[] = [root];
  function register(schema: Schema): void {
    if (record(schema) && typeof schema.$id === "string") {
      if (documents.has(schema.$id)) refusal("profile-schema-ref");
      documents.set(schema.$id, schema);
    }
  }
  register(root);
  for (const pin of registry) {
    if (!/^[0-9a-f]{64}$/.test(pin.sha256) || await rawDigest(pin.bytes) !== pin.sha256) refusal("profile-schema-ref");
    let schema: Schema;
    try { schema = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(pin.bytes)) as Schema; }
    catch { return refusal("profile-schema-ref"); }
    register(schema); roots.push(schema);
  }
  const references: Array<{ schema: RecordValue; document: Schema }> = [];
  const contexts = new WeakMap<RecordValue, Schema>();
  function inspect(schema: unknown, document: Schema): void {
    if (typeof schema === "boolean") return;
    if (!record(schema)) refusal("profile-schema-keyword");
    const object = schema as RecordValue;
    contexts.set(object, document);
    for (const key of Object.keys(object)) if (!keywords.has(key)) refusal("profile-schema-keyword");
    if (own(object, "pattern") && !patterns.has(object.pattern as string)) refusal("profile-schema-pattern");
    for (const key of ["$schema", "$id", "$comment", "title", "$ref"]) {
      if (own(object, key) && typeof object[key] !== "string") refusal("profile-schema-keyword");
    }
    if (own(object, "$ref")) references.push({ schema: object, document });
    if (own(object, "type")) {
      const types = Array.isArray(object.type) ? object.type : [object.type];
      if (!types.length || new Set(types).size !== types.length || types.some(t => !["null", "boolean", "object", "array", "number", "integer", "string"].includes(t as string))) refusal("profile-schema-keyword");
    }
    for (const key of ["required", "enum"]) {
      if (own(object, key) && (!Array.isArray(object[key]) || (key === "enum" && object[key].length === 0))) refusal("profile-schema-keyword");
    }
    if (Array.isArray(object.required) && (object.required.some(k => typeof k !== "string") || new Set(object.required).size !== object.required.length)) refusal("profile-schema-keyword");
    for (const key of ["additionalProperties", "uniqueItems"]) {
      if (own(object, key) && typeof object[key] !== "boolean") refusal("profile-schema-keyword");
    }
    for (const key of ["minItems", "maxItems", "minLength"]) {
      if (own(object, key) && (!Number.isSafeInteger(object[key]) || (object[key] as number) < 0)) refusal("profile-schema-keyword");
    }
    for (const key of ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"]) {
      if (own(object, key) && (typeof object[key] !== "number" || !Number.isFinite(object[key]))) refusal("profile-schema-keyword");
    }
    for (const key of ["$defs", "properties"]) {
      if (!own(object, key)) continue;
      if (!record(object[key])) refusal("profile-schema-keyword");
      for (const child of Object.values(object[key] as RecordValue)) inspect(child, document);
    }
    for (const key of ["items", "not", "if", "then", "else"]) if (own(object, key)) inspect(object[key], document);
    for (const key of ["allOf", "anyOf", "oneOf"]) {
      if (!own(object, key)) continue;
      if (!Array.isArray(object[key]) || !object[key].length) refusal("profile-schema-keyword");
      for (const child of object[key] as unknown[]) inspect(child, document);
    }
  }
  for (const schema of roots) inspect(schema, schema);
  function resolve(reference: string, document: Schema): Schema {
    const split = reference.indexOf("#");
    const id = split < 0 ? reference : reference.slice(0, split);
    const fragment = split < 0 ? "" : reference.slice(split + 1);
    let target: unknown = id ? documents.get(id) : document;
    if (target === undefined || (fragment && !fragment.startsWith("/"))) refusal("profile-schema-ref");
    if (fragment) for (const raw of fragment.slice(1).split("/")) {
      let key: string;
      try { key = decodeURIComponent(raw); } catch { return refusal("profile-schema-ref"); }
      if (/~(?![01])/.test(key)) refusal("profile-schema-ref");
      key = key.replace(/~1/g, "/").replace(/~0/g, "~");
      if ((!record(target) && !Array.isArray(target)) || !own(target as object, key)) refusal("profile-schema-ref");
      target = (target as RecordValue)[key];
    }
    if (typeof target !== "boolean" && (!record(target) || !contexts.has(target))) refusal("profile-schema-ref");
    return target as Schema;
  }
  const resolved = new WeakMap<RecordValue, Schema>();
  for (const ref of references) resolved.set(ref.schema, resolve(ref.schema.$ref as string, ref.document));
  return (value: unknown): SchemaOutcome => {
    canonicalize(value); // Materialized values must still be plain, finite JSON.
    const active = new Map<Schema, Set<unknown>>();
    function validate(schema: Schema, current: unknown): string | undefined {
      if (schema === true) return;
      if (schema === false) return "false";
      const values = active.get(schema) ?? new Set<unknown>();
      if (values.has(current)) return "$ref";
      values.add(current); active.set(schema, values);
      try { return check(schema, current); } finally { values.delete(current); }
    }
    function check(schema: RecordValue, current: unknown): string | undefined {
      if (own(schema, "$ref")) {
        const error = validate(resolved.get(schema)!, current);
        if (error) return error;
      }
      if (own(schema, "type")) {
        const matches = (type: unknown): boolean => {
          if (type === "null") return current === null;
          if (type === "object") return record(current);
          if (type === "array") return Array.isArray(current);
          if (type === "integer") return typeof current === "number" && Number.isSafeInteger(current);
          if (type === "number") return typeof current === "number" && Number.isFinite(current) && (!Number.isInteger(current) || Number.isSafeInteger(current));
          return typeof current === type;
        };
        if (!(Array.isArray(schema.type) ? schema.type : [schema.type]).some(matches)) return "type";
      }
      if (own(schema, "const") && canonicalize(current) !== canonicalize(schema.const)) return "const";
      if (Array.isArray(schema.enum) && !schema.enum.some(v => canonicalize(current) === canonicalize(v))) return "enum";
      if (typeof current === "number") {
        if (typeof schema.minimum === "number" && current < schema.minimum) return "minimum";
        if (typeof schema.maximum === "number" && current > schema.maximum) return "maximum";
        if (typeof schema.exclusiveMinimum === "number" && current <= schema.exclusiveMinimum) return "exclusiveMinimum";
        if (typeof schema.exclusiveMaximum === "number" && current >= schema.exclusiveMaximum) return "exclusiveMaximum";
      }
      if (typeof current === "string") {
        if (typeof schema.minLength === "number" && [...current].length < schema.minLength) return "minLength";
        if (typeof schema.pattern === "string") {
          const match = new RegExp(schema.pattern).exec(current);
          if (!match || match[0] !== current) return "pattern";
        }
      }
      if (Array.isArray(current)) {
        if (typeof schema.minItems === "number" && current.length < schema.minItems) return "minItems";
        if (typeof schema.maxItems === "number" && current.length > schema.maxItems) return "maxItems";
        if (schema.uniqueItems === true && new Set(current.map(canonicalize)).size !== current.length) return "uniqueItems";
        if (own(schema, "items")) for (const item of current) {
          const error = validate(schema.items as Schema, item);
          if (error) return error;
        }
      }
      if (record(current)) {
        if (Array.isArray(schema.required) && schema.required.some(key => !own(current, key as string))) return "required";
        const properties = record(schema.properties) ? schema.properties : {};
        for (const key of Object.keys(current)) {
          if (own(properties, key)) {
            const error = validate(properties[key] as Schema, current[key]);
            if (error) return error;
          } else if (schema.additionalProperties === false) return "additionalProperties";
        }
      }
      if (Array.isArray(schema.allOf)) for (const child of schema.allOf) {
        const error = validate(child as Schema, current);
        if (error) return error;
      }
      if (Array.isArray(schema.anyOf) && !schema.anyOf.some(child => !validate(child as Schema, current))) return "anyOf";
      if (Array.isArray(schema.oneOf) && schema.oneOf.filter(child => !validate(child as Schema, current)).length !== 1) return "oneOf";
      if (own(schema, "not") && !validate(schema.not as Schema, current)) return "not";
      if (own(schema, "if")) {
        const branch = validate(schema.if as Schema, current) ? "else" : "then";
        if (own(schema, branch)) return validate(schema[branch] as Schema, current);
      }
      return;
    }
    const keyword = validate(root, value);
    return keyword ? { valid: false, keyword } : { valid: true };
  };
}

/** Lexical checks always finish before the syntax validator is called. */
export function loadProfileText(text: string, validator: SchemaValidator, limits: ParseLimits = defaultParseLimits): unknown {
  const value = parseProfileText(text, limits);
  if (!validator(value).valid) refusal("profile-schema");
  return value;
}
