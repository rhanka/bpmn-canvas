import { BpmnModdle } from "bpmn-moddle";
import semantics from "./semantics.json" with { type: "json" };
import { IoError } from "./errors.js";
import type { IoErrorCode } from "./errors.js";
import type { BpmnDefinitions, ModdleElement } from "../types.js";

export type ModdleJsonValue = string | number | boolean | ModdleJsonElement | Readonly<Record<string, string>> | readonly ModdleJsonValue[];
export interface ModdleJsonElement {
  readonly $type: string;
  readonly [property: string]: ModdleJsonValue;
}
export interface ModdleDescriptor {
  readonly name: string;
  readonly prefix: string;
  readonly uri: string;
  readonly types: readonly unknown[];
  readonly [property: string]: unknown;
}
export interface JsonCodecConfiguration {
  readonly contractVersion: "1";
  /** Emit all descriptor defaults; absent optional properties and empty arrays stay distinct. */
  readonly defaults: "explicit";
  readonly descriptors: Readonly<Record<string, ModdleDescriptor>>;
}
/** Deterministic structural path accompanies the existing IO refusal convention. */
export class ModdleJsonError extends IoError {
  readonly path: string;
  constructor(code: IoErrorCode, path: string, message: string, ids: readonly string[] = []) {
    super(code, message, ids);
    this.path = path;
  }
  /** Shared Python wire tuple; the existing IO code/path remain available to consumers. */
  get diagnostic(): { code: string; path: string } {
    const codes: Partial<Record<IoErrorCode, string>> = { "unknown-type": "unsupported-type", "invalid-reference": "reference-type", "invalid-value": "primitive-type", "unknown-property": "unsupported-property", "unsupported-extension": "unsupported-attribute" };
    return { code: codes[this.code] ?? this.code, path: this.path === "$" ? "" : this.path.replace(/^\$\./, "/").replace(/\[(\d+)\]/g, "/$1").replace(/\./g, "/") };
  }
}

interface Property {
  name: string;
  type: string;
  isMany?: boolean;
  isReference?: boolean;
  isVirtual?: boolean;
  isId?: boolean;
  default?: string | number | boolean;
  ns: { name: string };
  definedBy?: { extends?: string[] };
}
interface Descriptor {
  name: string;
  properties: Property[];
  allTypes: { name: string; isAbstract?: boolean }[];
}
interface Registry {
  create(type: string): ModdleElement;
  getPackages(): { prefix: string; uri: string; enumerations?: { name: string; literalValues: { name: string }[] }[] }[];
}

// Per-object presence metadata, never serialized; no mutable module registry/configuration.
const explicitAttrs = Symbol("explicit-json-attrs");
const wireNames = Symbol("explicit-json-property-names");
const own = (o: object, key: PropertyKey): boolean => Object.hasOwn(o, key);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function fail(code: IoErrorCode, path: string, message: string, id?: string): never {
  throw new ModdleJsonError(code, path, message, id ? [id] : []);
}
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (record(value)) return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sorted(value[k])]));
  return value;
}

function registry(configuration: JsonCodecConfiguration): Registry {
  if (!record(configuration) || configuration.contractVersion !== "1" || configuration.defaults !== "explicit" ||
    Object.keys(configuration).some((k) => !["contractVersion", "defaults", "descriptors"].includes(k))) {
    fail("invalid-configuration", "$.configuration", "Expected contract 1 and explicit defaults");
  }
  const descriptors = configuration.descriptors;
  if (!record(descriptors) || JSON.stringify(sorted(descriptors.sem)) !== JSON.stringify(sorted(semantics))) {
    fail("invalid-configuration", "$.configuration.descriptors", "The shipped semantic descriptor is required");
  }
  const prefixes = new Set(["bpmn", "bpmndi", "dc", "di", "bioc", "color"]);
  const uris = new Set<string>();
  for (const key of Object.keys(descriptors).sort()) {
    const d = descriptors[key];
    if (!record(d) || d.prefix !== key || typeof d.uri !== "string" || !d.uri || typeof d.name !== "string" ||
      !Array.isArray(d.types) || prefixes.has(key) || uris.has(d.uri)) {
      fail("invalid-configuration", "$.configuration.descriptors", "Invalid or conflicting descriptor registration");
    }
    prefixes.add(key); uris.add(d.uri);
  }
  try { return new BpmnModdle(structuredClone(descriptors)) as Registry; }
  catch { return fail("invalid-configuration", "$.configuration.descriptors", "Descriptor registration failed"); }
}

/** F1: create containment and the ID index first, then resolve typed object links. No XML. */
export function hydrate(json: ModdleJsonElement, configuration: JsonCodecConfiguration): BpmnDefinitions {
  return convert(json, configuration, "hydrate") as BpmnDefinitions;
}

/** F1: walk only descriptor containment and emit reference IDs, never stringify the live graph. */
export function project(model: BpmnDefinitions, configuration: JsonCodecConfiguration): ModdleJsonElement {
  return convert(model, configuration, "project") as ModdleJsonElement;
}

function convert(input: unknown, configuration: JsonCodecConfiguration, mode: "hydrate" | "project"): ModdleElement | ModdleJsonElement {
  const moddle = registry(configuration);
  if (!record(input) || input.$type !== "bpmn:Definitions") fail("not-bpmn", "$", "Expected bpmn:Definitions");
  const seen = new Set<object>();
  const byId = new Map<string, { input: Record<string, unknown>; output: ModdleElement | ModdleJsonElement }>();
  const pending: { output: Record<string, unknown>; property: Property; value: unknown; path: string; id?: string }[] = [];
  const packages = moddle.getPackages();
  const namespaces = new Map(packages.map((p) => [p.prefix, p.uri]));
  const enums = new Map(packages.flatMap((p) => (p.enumerations ?? []).map((e) => [e.name.includes(":") ? e.name : `${p.prefix}:${e.name}`, new Set(e.literalValues.map((v) => v.name))] as const)));

  function primitive(value: unknown, property: Property, path: string): string | number | boolean {
    const type = property.type;
    let valid = false;
    if (type === "String") valid = typeof value === "string";
    else if (type === "Boolean") valid = typeof value === "boolean";
    else if (type === "Integer") valid = typeof value === "number" && Number.isSafeInteger(value);
    else if (type === "Real") valid = typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0);
    else if (enums.has(type)) valid = typeof value === "string" && enums.get(type)!.has(value);
    if (!valid) fail("invalid-value", path, `Expected ${type}`);
    if (property.isId && (typeof value !== "string" || !value)) fail("invalid-value", path, "IDs must be nonempty strings");
    return value as string | number | boolean;
  }
  const isPrimitive = (p: Property): boolean => ["String", "Boolean", "Integer", "Real"].includes(p.type) || enums.has(p.type);
  function matches(value: ModdleElement, type: string): boolean {
    return type === "Element" || value.$instanceOf(type);
  }
  function sequence(value: unknown, property: Property, path: string, fn: (v: unknown, p: string) => unknown): unknown {
    if (!property.isMany) return fn(value, path);
    if (!Array.isArray(value)) fail(property.isReference ? "invalid-reference" : "invalid-value", path, "Expected an array");
    const out = [];
    for (let i = 0; i < value.length; i++) {
      if (!own(value, i)) fail("invalid-value", `${path}[${i}]`, "Sparse arrays are not JSON");
      out.push(fn(value[i], `${path}[${i}]`));
    }
    return out;
  }
  function attributes(value: unknown, path: string, properties: Map<string, Property>): Record<string, string> {
    if (!record(value)) fail("invalid-value", path, "Expected an attribute object");
    const attrs: Record<string, string> = {};
    for (const k of Object.keys(value).sort()) {
      const v = value[k];
      // G0 proves unqualified string attributes. Registered declarations remain supported.
      const prefix = k.startsWith("xmlns:") ? k.slice(6) : k === "xmlns" ? "bpmn" : undefined;
      const unqualified = /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(k) && k !== "xmlns" && !properties.has(k) && typeof v === "string";
      if (!unqualified && (prefix === undefined || v !== namespaces.get(prefix))) fail("unsupported-extension", `${path}.${k}`, "Unsupported attribute or namespace version");
      attrs[k] = v as string;
    }
    return attrs;
  }
  function walk(value: unknown, path: string, expectedType?: string, parent?: ModdleElement): ModdleElement | ModdleJsonElement {
    if (!record(value)) fail("invalid-containment", path, "Expected typed containment object");
    if (seen.has(value)) fail("invalid-containment", path, "Cyclic or shared containment");
    seen.add(value);
    let native: ModdleElement;
    if (typeof value.$type !== "string") fail("unknown-type", `${path}.$type`, "Expected registered $type");
    try { native = moddle.create(value.$type); }
    catch { return fail("unknown-type", `${path}.$type`, "Unknown registered type"); }
    const descriptor = native.$descriptor as Descriptor;
    if (descriptor.allTypes.some((t) => t.name === value.$type && t.isAbstract)) fail("invalid-containment", path, "Abstract containment type");
    if (expectedType && !matches(native, expectedType)) fail("invalid-containment", path, `Expected ${expectedType}`);
    if (mode === "project" && (!value.$descriptor || typeof value.$instanceOf !== "function" ||
      JSON.stringify(sorted((value.$descriptor as Descriptor).properties)) !== JSON.stringify(sorted(descriptor.properties)))) {
      fail("invalid-model", path, "Expected native objects with the configured descriptors");
    }
    const output: Record<string, unknown> = mode === "hydrate" ? native : { $type: value.$type };
    if (mode === "hydrate" && parent) native.$parent = parent;
    const properties = new Map(descriptor.properties.flatMap((p) => [[p.name, p], [p.ns.name, p]] as [string, Property][]));
    for (const key of Object.keys(value).sort()) {
      if (key === "$type" || key === "$attrs" || (mode === "project" && key === "$parent")) continue;
      if (!properties.has(key)) fail("unknown-property", `${path}.${key}`, "Unknown property");
    }
    if (mode === "project" && value.$parent !== undefined && value.$parent !== parent) fail("invalid-containment", path, "Containment parent mismatch");
    const attrs = mode === "hydrate" ? own(value, "$attrs") : (Object.keys((value.$attrs as object) ?? {}).length > 0 || own(value, explicitAttrs));
    if (attrs) {
      const copied = attributes(value.$attrs, `${path}.$attrs`, properties);
      if (mode === "hydrate") Object.assign(native.$attrs, copied);
      else output.$attrs = copied;
      if (mode === "hydrate") Object.defineProperty(output, explicitAttrs, { value: true });
    }
    const names: Record<string, string> = {};
    if (mode === "hydrate") Object.defineProperty(output, wireNames, { value: names });
    for (const p of [...descriptor.properties].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const name = mode === "hydrate" && own(value, p.ns.name) ? p.ns.name : mode === "project" ? (value[wireNames as unknown as string] as Record<string, string> | undefined)?.[p.name] ?? p.name : p.name;
      const present = own(value, mode === "hydrate" ? name : p.name);
      if (!present && p.default === undefined) continue;
      if (mode === "hydrate") names[p.name] = name;
      const propertyPath = `${path}.${name}`;
      if (p.isVirtual) fail("unsupported-structure", propertyPath, "Virtual runtime properties are not wire containment");
      const v = present ? value[mode === "hydrate" ? name : p.name] : (["Real", "Integer"].includes(p.type) ? Number(p.default) : p.default);
      const outputName = mode === "hydrate" ? p.name : name;
      if (p.isReference) {
        pending.push({ output, property: p, value: v, path: propertyPath, ...(typeof value.id === "string" ? { id: value.id } : {}) });
      } else if (isPrimitive(p)) {
        output[outputName] = sequence(v, p, propertyPath, (item, itemPath) => primitive(item, p, itemPath));
      } else {
        output[outputName] = sequence(v, p, propertyPath, (item, itemPath) => walk(item, itemPath, p.type, mode === "hydrate" ? native : value as ModdleElement));
        if (p.isMany && Array.isArray(v)) {
          let found = false;
          for (let i = 0; i < v.length; i++) if (record(v[i]) && v[i].$type === "sem:Info") {
            if (found) fail("duplicate-extension", `${propertyPath}[${i}]`, "Duplicate singleton extension");
            found = true;
          }
        }
      }
      if (p.isId) {
        const id = output[p.name] as string;
        if (byId.has(id)) fail("duplicate-id", propertyPath, "Duplicate ID", id);
        byId.set(id, { input: value, output: output as ModdleElement });
      }
    }
    return output as ModdleElement | ModdleJsonElement;
  }
  const result = walk(input, "$");
  for (const { output, property: p, value, path, id } of pending) {
    output[p.name] = sequence(value, p, path, (ref, refPath) => {
      const refId = mode === "hydrate" ? ref : record(ref) ? ref.id : undefined;
      if (typeof refId !== "string" || !refId) fail("invalid-reference", refPath, "Reference needs a contained ID", id);
      const target = byId.get(refId);
      if (!target) fail("dangling-reference", refPath, "Unknown reference ID", id);
      const nativeTarget = (mode === "hydrate" ? target.output : target.input) as ModdleElement;
      if (!matches(nativeTarget, p.type) || (mode === "project" && ref !== target.input)) fail("invalid-reference", refPath, "Wrong reference type or detached object", id);
      return mode === "hydrate" ? nativeTarget : refId;
    });
  }
  return result;
}
