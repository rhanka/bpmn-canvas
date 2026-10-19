import { BpmnModdle } from "bpmn-moddle";
import { observeF1Source } from "./f1-source.js";
import { IoError } from "./errors.js";
import type { IoErrorCode } from "./errors.js";
import type { BpmnDefinitions, ModdleElement } from "../types.js";
import {
  F1_LIMITS,
  F1_EXPLICIT_ATTRS as explicitAttrs,
  F1_WIRE_NAMES as wireNames,
  assertF1InputSize,
  assertF1AttributeNamespaces,
  assertF1NativeObjectSize,
  assertF1XmlLimits,
  assertF1TagIntegrity,
  assertF1XmlSafety,
  canonicalJsonBytes,
  capF1Warnings,
  classifyF1AttributeName,
  decodeF1Bytes,
  f1Pointer,
  f1NamespaceScope,
  f1ChildPath,
  f1PathPointer,
  isF1EncodingFallbackWarning,
  isF1QName,
  isF1ReservedName,
  scanF1ReservedAttributes,
  scanF1XmlLosses,
  splitF1QName,
} from "./f1-extensions.js";
import type { F1Diagnostic } from "./f1-extensions.js";

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
    return { code: codes[this.code] ?? this.code, path: f1PathPointer(this.path) };
  }
}

interface Property {
  name: string;
  type: string;
  isMany?: boolean;
  isReference?: boolean;
  isVirtual?: boolean;
  isId?: boolean;
  isAttr?: boolean;
  default?: string | number | boolean;
  ns: { name: string };
  definedBy?: { extends?: string[] };
}
interface Descriptor {
  name: string;
  properties: Property[];
  allTypes: { name: string; isAbstract?: boolean }[];
  isGeneric?: boolean;
  ns?: { prefix: string; localName: string; uri: string };
}
interface Registry {
  getType(type: string): { $descriptor: Descriptor & { propertiesByName: Record<string, Property> }; hasType(type: string): boolean };
  fromXML(text: string): Promise<{ rootElement: BpmnDefinitions; warnings: readonly unknown[] }>;
  create(type: string): ModdleElement;
  createAny(name: string, uri: string, attrs: Record<string, string>): ModdleElement;
  getPackages(): { prefix: string; uri: string; enumerations?: { name: string; literalValues: { name: string }[] }[] }[];
}

// Per-object presence metadata, never serialized; no mutable module registry/configuration.
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
  if (!record(descriptors)) {
    fail("invalid-configuration", "$.configuration.descriptors", "Expected an injected descriptor map");
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

/**
 * F1: project with the per-node loss diagnostics the throwing projection
 * omits. Mixed text/child ordering inside generic bodies is certain loss:
 * the native tree concatenates them, so only the fact and the node survive.
 */
export function projectWithDiagnostics(model: BpmnDefinitions, configuration: JsonCodecConfiguration): { json: ModdleJsonElement; diagnostics: F1Diagnostic[] } {
  const diagnostics: F1Diagnostic[] = [];
  const json = convert(model, configuration, "project", diagnostics) as ModdleJsonElement;
  return { json, diagnostics };
}

function convert(input: unknown, configuration: JsonCodecConfiguration, mode: "hydrate" | "project", losses?: F1Diagnostic[]): ModdleElement | ModdleJsonElement {
  const moddle = registry(configuration);
  if (!record(input) || input.$type !== "bpmn:Definitions") fail("not-bpmn", "$", "Expected bpmn:Definitions");
  // Object size is the UTF-8 JCS bytes of the projected JSON. The native
  // input graph is never measured: it carries $parent cycles and the live
  // model. Hydrate measures its JSON input; project measures its output.
  if (mode === "hydrate" && canonicalJsonBytes(input, F1_LIMITS.maxObjectBytes) > F1_LIMITS.maxObjectBytes) {
    fail("xml-input-size-limit", "$", "Projected JSON exceeds 64 MiB");
  }
  const seen = new Set<object>();
  const byId = new Map<string, { input: Record<string, unknown>; output: ModdleElement | ModdleJsonElement }>();
  const pending: { output: Record<string, unknown>; property: Property; value: unknown; path: string; id?: string }[] = [];
  const packages = moddle.getPackages();
  const namespaces = new Map(packages.map((p) => [p.prefix, p.uri]));
  const enums = new Map(packages.flatMap((p) => (p.enumerations ?? []).map((e) => [e.name.includes(":") ? e.name : `${p.prefix}:${e.name}`, new Set(e.literalValues.map((v) => v.name))] as const)));
  let elements = 0;
  // Descriptor snapshots include non-enumerable package metadata and every
  // effective inherited type; cache is confined to this conversion.
  const identities = new Map<Descriptor, string>();
  function identity(d: Descriptor): string {
    let result = identities.get(d);
    if (result === undefined) {
      const packages = d.allTypes.map((t) => (t as { $pkg?: unknown }).$pkg);
      result = JSON.stringify(sorted({ descriptor: d, packages, package: (d as Descriptor & { $pkg?: unknown }).$pkg }));
      identities.set(d, result);
    }
    return result;
  }
  const sameDescriptor = (a: Descriptor, b: Descriptor): boolean => identity(a) === identity(b);
  let nearestId: string | undefined;
  function refuse(code: IoErrorCode, path: string, message: string, id?: string): never {
    return fail(code, path, message, id ?? nearestId);
  }

  function primitive(value: unknown, property: Property, path: string): string | number | boolean {
    const type = property.type;
    let valid = false;
    if (type === "String") valid = typeof value === "string";
    else if (type === "Boolean") valid = typeof value === "boolean";
    else if (type === "Integer") valid = typeof value === "number" && Number.isSafeInteger(value);
    else if (type === "Real") valid = typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0);
    else if (enums.has(type)) valid = typeof value === "string" && enums.get(type)!.has(value);
    if (!valid) refuse("invalid-value", path, `Expected ${type}`);
    if (property.isId && (typeof value !== "string" || !value)) refuse("invalid-value", path, "IDs must be nonempty strings");
    return value as string | number | boolean;
  }
  const isPrimitive = (p: Property): boolean => ["String", "Boolean", "Integer", "Real"].includes(p.type) || enums.has(p.type);
  function matches(value: ModdleElement, type: string): boolean {
    return type === "Element" || value.$instanceOf(type);
  }
  function sequence(value: unknown, property: Property, path: string, fn: (v: unknown, p: string, index?: number) => unknown): unknown {
    if (!property.isMany) return fn(value, path);
    if (!Array.isArray(value)) refuse(property.isReference ? "invalid-reference" : "invalid-value", path, "Expected an array");
    const out = [];
    for (let i = 0; i < value.length; i++) {
      if (!own(value, i)) refuse("invalid-value", `${path}[${i}]`, "Sparse arrays are not JSON");
      out.push(fn(value[i], `${path}[${i}]`, i));
    }
    return out;
  }
  function attributes(value: unknown, path: string, properties: Map<string, Property>, scope: ReadonlyMap<string, string>): Record<string, string> {
    if (!record(value)) refuse("invalid-value", path, "Expected an attribute object");
    const keys = Object.keys(value);
    if (keys.length > F1_LIMITS.maxAttributesPerElement) {
      refuse("xml-attribute-count-limit", path, "Element carries more than 1024 attributes");
    }
    const attrs: Record<string, string> = {};
    for (const k of keys.sort()) {
      if (isF1ReservedName(k)) refuse("reserved-name", f1ChildPath(path, k), `Reserved attribute name ${k}`);
      const v = (value as Record<string, unknown>)[k];
      if (typeof v !== "string") refuse("unsupported-extension", f1ChildPath(path, k), "Foreign attributes stay strings");
      const text = v as string;
      if (k.length > F1_LIMITS.maxAttributeUtf16Units || text.length > F1_LIMITS.maxAttributeUtf16Units) {
        refuse("xml-attribute-length-limit", f1ChildPath(path, k), "Attribute name or value exceeds 1048576 UTF-16 units");
      }
      const kind = classifyF1AttributeName(k);
      if (kind === "malformed") {
        // Namespace declarations keep their XML shape everywhere. Ordinary
        // foreign keys are opaque map entries in the JSON lane: the native
        // reader never produces names outside the XML ranges (it drops them
        // with a warning), so hydrate accepts them for the round-trip fixed
        // point and the F7 writer still gates writability.
        if (k.startsWith("xmlns:")) refuse("malformed-qname", f1ChildPath(path, k), `Malformed attribute name ${k}`);
      }
      if (kind === "xmlns-default") {
        // The default declaration (including the native reset form) is
        // retained verbatim, exactly where the native tree keeps it.
      } else if (kind === "xmlns-prefixed") {
        // Effective descriptor identity: a declaration rebinding a
        // configured package prefix must carry that package URI.
        const prefix = k.slice("xmlns:".length);
        const pinned = namespaces.get(prefix);
        if (properties.size > 0 && pinned !== undefined && text !== pinned) {
          refuse("unsupported-extension", f1ChildPath(path, k), "Unsupported namespace version");
        }
      } else if (kind === "qualified") {
        // C0: qualified foreign attributes are retained verbatim without
        // interpreting their values. Prefix bindings belong to XML scope
        // and are resolved by the native reader, never inferred here.
      } else if (properties.has(k)) {
        refuse("unsupported-extension", f1ChildPath(path, k), "Declared properties do not travel in $attrs");
      }
      attrs[k] = text;
    }
    try { assertF1AttributeNamespaces(attrs, scope, [...new Set(properties.values())].map((p) => p.ns.name), namespaces); }
    catch (error) { if (error instanceof IoError) refuse(error.code, path, error.message); throw error; }
    return attrs;
  }
  const isNativeGeneric = (entry: Record<string, unknown>): boolean =>
    record((entry as ModdleElement).$descriptor) && ((entry as ModdleElement).$descriptor as Descriptor).isGeneric === true;

  function walk(value: unknown, path: string, expectedType?: string, parent?: ModdleElement, depth = 1, segments: readonly (string | number)[] = [], inherited: ReadonlyMap<string, string> = namespaces): ModdleElement | ModdleJsonElement {
    if (depth > F1_LIMITS.maxDepth) refuse("xml-depth-limit", path, "Element nesting exceeds 256");
    if (!record(value)) refuse("invalid-containment", path, "Expected typed containment object");
    if (seen.has(value)) refuse("invalid-containment", path, "Cyclic or shared containment");
    seen.add(value);
    elements += 1;
    if (elements > F1_LIMITS.maxElements) refuse("xml-element-count-limit", path, "Document carries more than 1000000 elements");
    const outerId = nearestId;
    const candidate = value.id;
    const attrRecord = record(value.$attrs) ? value.$attrs : undefined;
    const attrCandidate = attrRecord?.id;
    if (typeof candidate === "string" && candidate) nearestId = candidate;
    else if (typeof attrCandidate === "string" && attrCandidate) nearestId = attrCandidate;
    try {
      const generic = mode === "hydrate" ? value.$type === "$any" : isNativeGeneric(value);
      const name = generic ? mode === "hydrate" ? value.$name : { qname: value.$type, uri: (value.$descriptor as Descriptor).ns?.uri ?? "" } : undefined;
      const attrs = generic && mode === "project" ? value : record(value.$attrs) ? value.$attrs : {};
      const scope = f1NamespaceScope(inherited, attrs, record(name) && typeof name.qname === "string" && typeof name.uri === "string" ? { qname: name.qname, uri: name.uri } : undefined);
      // Generic dispatch precedes registered-type dispatch throughout the traversal.
      if (generic) {
        return walkGeneric(value, path, expectedType, parent, depth, segments, scope);
      }
      return walkTyped(value, path, expectedType, parent, depth, segments, scope);
    } finally {
      nearestId = outerId;
    }
  }
  function walkTyped(value: Record<string, unknown>, path: string, expectedType: string | undefined, parent: ModdleElement | undefined, depth: number, segments: readonly (string | number)[], scope: ReadonlyMap<string, string>): ModdleElement | ModdleJsonElement {
    let native: ModdleElement;
    if (typeof value.$type !== "string") refuse("unknown-type", `${path}.$type`, "Expected registered $type");
    try { native = moddle.create(value.$type as string); }
    catch { return refuse("unknown-type", `${path}.$type`, "Unknown registered type"); }
    const descriptor = native.$descriptor as Descriptor;
    if (descriptor.allTypes.some((t) => t.name === value.$type && t.isAbstract)) refuse("invalid-containment", path, "Abstract containment type");
    if (expectedType && !matches(native, expectedType)) refuse("invalid-containment", path, `Expected ${expectedType}`);
    if (mode === "project" && (!value.$descriptor || typeof value.$instanceOf !== "function" ||
      !sameDescriptor(value.$descriptor as Descriptor, descriptor))) {
      refuse("descriptor-mismatch", path, "Expected native objects with the configured descriptors");
    }
    const output: Record<string, unknown> = mode === "hydrate" ? native : { $type: value.$type };
    if (mode === "hydrate" && parent) native.$parent = parent;
    const properties = new Map(descriptor.properties.flatMap((p) => [[p.name, p], [p.ns.name, p]] as [string, Property][]));
    let attributeCount = record(value.$attrs) ? Object.keys(value.$attrs).length : 0;
    for (const property of descriptor.properties) {
      const key = own(value, property.ns.name) ? property.ns.name : property.name;
      if (!property.isAttr || !own(value, key)) continue;
      if (++attributeCount > F1_LIMITS.maxAttributesPerElement) refuse("xml-attribute-count-limit", path, "Element carries more than 1024 attributes");
      const entry = value[key];
      if (key.length > F1_LIMITS.maxAttributeUtf16Units || (typeof entry === "string" && entry.length > F1_LIMITS.maxAttributeUtf16Units)) {
        refuse("xml-attribute-length-limit", `${path}.${key}`, "Attribute name or value exceeds 1048576 UTF-16 units");
      }
    }
    for (const key of Object.keys(value).sort()) {
      if (key === "$type" || key === "$attrs" || (mode === "project" && key === "$parent")) continue;
      if (!properties.has(key)) {
        // Schema-owned fields are allowed only in their defined positions.
        if (isF1ReservedName(key)) refuse("reserved-name", f1ChildPath(path, key), `Reserved member ${key} outside its defined position`);
        refuse("unknown-property", f1ChildPath(path, key), "Unknown property");
      }
    }
    if (mode === "project" && value.$parent !== undefined && value.$parent !== parent) refuse("invalid-containment", path, "Containment parent mismatch");
    const attrs = mode === "hydrate" ? own(value, "$attrs") : (Object.keys((value.$attrs as object) ?? {}).length > 0 || own(value, explicitAttrs));
    if (attrs) {
      const copied = attributes(value.$attrs, `${path}.$attrs`, properties, scope);
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
      const propertyPath = f1ChildPath(path, name);
      if (p.isVirtual) refuse("unsupported-structure", propertyPath, "Virtual runtime properties are not wire containment");
      const v = present ? value[mode === "hydrate" ? name : p.name] : (["Real", "Integer"].includes(p.type) ? Number(p.default) : p.default);
      const outputName = mode === "hydrate" ? p.name : name;
      if (p.isReference) {
        pending.push({ output, property: p, value: v, path: propertyPath, ...(nearestId !== undefined ? { id: nearestId } : {}) });
      } else if (isPrimitive(p)) {
        output[outputName] = sequence(v, p, propertyPath, (item, itemPath) => primitive(item, p, itemPath));
      } else {
        output[outputName] = sequence(v, p, propertyPath, (item, itemPath, itemIndex) => walk(
          item,
          itemPath,
          p.type,
          mode === "hydrate" ? native : value as unknown as ModdleElement,
          depth + 1,
          itemIndex === undefined ? [...segments, p.name] : [...segments, p.name, itemIndex],
          scope,
        ));
      }
      if (p.isId) {
        const id = output[p.name] as string;
        if (byId.has(id)) refuse("duplicate-id", propertyPath, "Duplicate ID", id);
        byId.set(id, { input: value, output: output as ModdleElement });
      }
    }
    return output as ModdleElement | ModdleJsonElement;
  }
  const EMPTY_PROPERTIES = new Map<string, Property>();
  const GENERIC_RUNTIME_KEYS = new Set(["$type", "$parent", "$descriptor", "$model", "$body", "$children"]);
  function walkGeneric(value: Record<string, unknown>, path: string, expectedType: string | undefined, parent: ModdleElement | undefined, depth: number, segments: readonly (string | number)[], scope: ReadonlyMap<string, string>): ModdleElement | ModdleJsonElement {
    if (expectedType !== undefined && expectedType !== "Element") {
      refuse("invalid-containment", path, `Generic content cannot live in ${expectedType}`);
    }
    // Wire-shape validation applies to JSON input only. Native generic
    // attributes live as direct properties and are checked per entry below.
    if (mode === "hydrate") {
      for (const key of Object.keys(value).sort()) {
        if (key === "$type" || key === "$name" || key === "$attrs" || key === "$body" || key === "$children") continue;
        if (key === "$parent" || key === "$descriptor" || key === "$model" || isF1ReservedName(key)) {
          refuse("reserved-name", f1ChildPath(path, key), `Reserved generic field ${key}`);
        }
        refuse("unknown-property", f1ChildPath(path, key), "Unknown generic field");
      }
    }
    if (mode === "hydrate") {
      const name = value.$name;
      if (!record(name)) refuse("invalid-any", path, "Generic elements need $name");
      for (const key of Object.keys(name).sort()) {
        if (key !== "qname" && key !== "uri") refuse("invalid-any", f1ChildPath(`${path}.$name`, key), "Generic $name keeps qname and uri");
      }
      if (typeof name.qname !== "string" || !isF1QName(name.qname)) {
        refuse("malformed-qname", `${path}.$name`, "Generic $name.qname stays a QName");
      }
      // The empty string is the no-namespace URI: an unprefixed generic
      // element with no in-scope default namespace keeps uri "".
      if (typeof name.uri !== "string") refuse("invalid-namespace", `${path}.$name`, "Generic elements keep their namespace URI");
      // A missing $attrs expands to {} visibly; the expanded form is the fixed point.
      const copied = attributes(own(value, "$attrs") ? value.$attrs : {}, `${path}.$attrs`, EMPTY_PROPERTIES, scope);
      let body: string | undefined;
      if (own(value, "$body")) {
        if (typeof value.$body !== "string") refuse("invalid-any", `${path}.$body`, "Generic $body stays a string");
        body = value.$body as string;
      }
      const native = moddle.createAny(name.qname as string, name.uri as string, copied);
      if (parent) native.$parent = parent;
      if (body !== undefined) (native as unknown as Record<string, unknown>).$body = body;
      if (own(value, "$children")) {
        if (!Array.isArray(value.$children)) refuse("invalid-any", `${path}.$children`, "Generic $children stay an array");
        const inputs = value.$children as unknown[];
        const children: ModdleElement[] = [];
        for (let i = 0; i < inputs.length; i++) {
          if (!own(inputs, i)) refuse("invalid-value", `${path}.$children[${i}]`, "Sparse arrays are not JSON");
          const item = inputs[i];
          if (!record(item) || item.$type !== "$any") refuse("invalid-any", `${path}.$children[${i}]`, "Generic $children stay generic");
          children.push(walk(item, `${path}.$children[${i}]`, undefined, native, depth + 1, [...segments, "$children", i], scope) as ModdleElement);
        }
        (native as unknown as Record<string, unknown>).$children = children;
      }
      return native;
    }
    const element = value as unknown as ModdleElement;
    const descriptor = (record(element.$descriptor) ? element.$descriptor : {}) as unknown as Descriptor;
    if (descriptor.name !== element.$type || typeof element.$instanceOf !== "function") {
      refuse("invalid-model", path, "Expected native generic objects with the configured descriptors");
    }
    // A missing namespace URI projects as "": the native reader omits the
    // uri for elements outside every namespace (unprefixed, no default).
    const rawUri = descriptor.ns?.uri;
    if (rawUri !== undefined && typeof rawUri !== "string") refuse("invalid-namespace", path, "Generic elements keep their namespace URI");
    const uri = rawUri ?? "";
    if (element.$parent !== undefined && element.$parent !== parent) refuse("invalid-containment", path, "Containment parent mismatch");
    const collected: Record<string, string> = {};
    for (const key of ["get", "set", "$instanceOf"]) {
      const member = Object.getOwnPropertyDescriptor(element, key);
      if (member && (member.enumerable || typeof member.value !== "function")) {
        refuse("reserved-name", f1ChildPath(`${path}.$attrs`, key), "Reserved foreign property");
      }
    }
    const names = Object.keys(element).filter((key) => !GENERIC_RUNTIME_KEYS.has(key));
    if (names.length > F1_LIMITS.maxAttributesPerElement) {
      refuse("xml-attribute-count-limit", path, "Element carries more than 1024 attributes");
    }
    for (const key of names.sort()) {
      const entry: unknown = (element as unknown as Record<string, unknown>)[key];
      if (isF1ReservedName(key)) refuse("reserved-name", f1ChildPath(`${path}.$attrs`, key), "Reserved foreign property");
      if (typeof entry !== "string") refuse("invalid-value", f1ChildPath(`${path}.$attrs`, key), "Generic attributes stay strings");
      const text = entry as string;
      if (key.length > F1_LIMITS.maxAttributeUtf16Units || text.length > F1_LIMITS.maxAttributeUtf16Units) {
        refuse("xml-attribute-length-limit", f1ChildPath(`${path}.$attrs`, key), "Attribute name or value exceeds 1048576 UTF-16 units");
      }
      // Same JSON-lane opacity as hydrate: ordinary foreign keys stay opaque
      // map entries here (the F7 writer gates writability); declarations
      // keep their XML shape.
      if (classifyF1AttributeName(key) === "malformed" && key.startsWith("xmlns:")) {
        refuse("malformed-qname", f1ChildPath(`${path}.$attrs`, key), `Malformed attribute name ${key}`);
      }
      collected[key] = text;
    }
    try { assertF1AttributeNamespaces(collected, scope); }
    catch (error) { if (error instanceof IoError) refuse(error.code, `${path}.$attrs`, error.message); throw error; }
    const output: Record<string, unknown> = {
      $type: "$any",
      $name: { qname: element.$type, uri },
      $attrs: collected,
    };
    const nativeBody: unknown = (element as unknown as Record<string, unknown>).$body;
    if (nativeBody !== undefined) {
      if (typeof nativeBody !== "string") refuse("invalid-value", `${path}.$body`, "Generic $body stays a string");
      output.$body = nativeBody;
    }
    const nativeChildren: unknown = (element as unknown as Record<string, unknown>).$children;
    if (nativeChildren !== undefined) {
      if (!Array.isArray(nativeChildren)) refuse("invalid-value", `${path}.$children`, "Generic $children stay an array");
      output.$children = (nativeChildren as unknown[]).map((item, index) => {
        if (!record(item) || !isNativeGeneric(item)) refuse("invalid-any", `${path}.$children[${index}]`, "Generic $children stay generic");
        return walk(item, `${path}.$children[${index}]`, undefined, element, depth + 1, [...segments, "$children", index], scope);
      });
    }
    if (losses && typeof nativeBody === "string" && nativeBody.length > 0 && Array.isArray(nativeChildren) && nativeChildren.length > 0) {
      losses.push({
        code: "moddle-content-normalized",
        path: f1Pointer(segments),
        ...(nearestId !== undefined ? { target: nearestId } : {}),
        message: "Generic body text and child order cannot both survive the native tree",
      });
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
  if (mode === "project" && canonicalJsonBytes(result, F1_LIMITS.maxObjectBytes) > F1_LIMITS.maxObjectBytes) {
    fail("xml-input-size-limit", "$", "Projected JSON exceeds 64 MiB");
  }
  return result;
}

export interface F1ParseResult {
  readonly rootElement: BpmnDefinitions;
  readonly diagnostics: readonly F1Diagnostic[];
}

/**
 * F1 XML boundary: bytes or text to the native tree plus typed diagnostics.
 * Safety refusals and the reserved-attribute pre-scan run before native
 * model construction; a post-parse traversal re-checks retained names with
 * structural pointers; native warnings are capped and classified.
 */
export async function parseF1Xml(input: string | Uint8Array, configuration: JsonCodecConfiguration): Promise<F1ParseResult> {
  let text: string;
  if (typeof input === "string") {
    const bytes = new TextEncoder().encode(input);
    assertF1InputSize(bytes);
    if (bytes.length > F1_LIMITS.maxDecodedBytes) throw new IoError("xml-input-size-limit", "Decoded input exceeds 64 MiB");
    text = input;
  } else {
    text = decodeF1Bytes(input).text;
  }
  const locateRefusal = (error: IoError): IoError => {
    // Lexical refusals retain precedence over configuration validation.
    try {
      const observed = observeF1Source(text, registry(configuration));
      const location = error.code === "reserved-name" ? observed.reserved : observed.entity;
      if (location) return location;
    } catch { /* unavailable configuration cannot provide descriptor coordinates */ }
    return new ModdleJsonError(error.code, "$", error.message);
  };
  try { assertF1XmlSafety(text); }
  catch (error) {
    if (error instanceof IoError && error.code === "xml-entity-reference-unsupported") {
      throw locateRefusal(error);
    }
    throw error;
  }
  assertF1XmlLimits(text);
  try {
    scanF1ReservedAttributes(text);
  } catch (error) {
    if (error instanceof IoError) throw locateRefusal(error);
    throw error;
  }
  try {
    assertF1TagIntegrity(text);
  } catch (error) {
    if (error instanceof IoError) throw new ModdleJsonError(error.code, "$", error.message);
    throw error;
  }
  const moddle = registry(configuration);
  const source = observeF1Source(text, moddle);
  if (source.reserved) throw source.reserved;
  let parsed: { rootElement: BpmnDefinitions; warnings: readonly unknown[] };
  try {
    parsed = await moddle.fromXML(text) as {
      rootElement: BpmnDefinitions;
      warnings: readonly unknown[];
    };
  } catch (error) {
    throw new ModdleJsonError("xml-invalid", "$", `Native XML reader failed: ${String(error)}`);
  }
  assertNoReservedNative(parsed.rootElement);
  assertF1NativeObjectSize(parsed.rootElement);
  // Loss pre-scan first (lexical, document order), then native warnings with
  // resolved locations. The reader's encoding-fallback notice is dropped:
  // F1 decodes through its own registry before the native reader runs.
  const losses = [...scanF1XmlLosses(text, false), ...source.losses];
  const { kept, truncated } = capF1Warnings(
    parsed.warnings.filter((warning) => !isF1EncodingFallbackWarning(warning)),
    parsed.rootElement,
  );
  return { rootElement: parsed.rootElement, diagnostics: truncated ? [...losses, ...kept, truncated] : [...losses, ...kept] };
}

function isModdleElement(entry: unknown): entry is ModdleElement {
  return record(entry) && typeof entry.$type === "string" && record((entry as ModdleElement).$descriptor);
}

function assertNoReservedNative(root: BpmnDefinitions): void {
  const seen = new Set<object>();
  const visit = (element: ModdleElement, path: string, ancestorId: string | undefined): void => {
    if (seen.has(element)) return;
    seen.add(element);
    const id = typeof element.id === "string" && element.id ? element.id : ancestorId;
    const ids = id !== undefined ? [id] : [];
    const deny = (key: string, pointer: string): void => {
      if (isF1ReservedName(key)) throw new ModdleJsonError("reserved-name", pointer, `Reserved attribute name ${key}`, ids);
    };
    const attrs = element.$attrs;
    if (record(attrs)) {
      for (const key of Object.keys(attrs)) deny(key, f1ChildPath(`${path}.$attrs`, key));
    }
    if ((element.$descriptor as Descriptor | undefined)?.isGeneric === true) {
      for (const key of Object.keys(element)) {
        if (key === "$type" || key === "$parent" || key === "$descriptor" || key === "$model" || key === "$body" || key === "$children") continue;
        deny(key, f1ChildPath(`${path}.$attrs`, key));
      }
    }
    for (const key of Object.keys(element)) {
      if (key === "$type" || key === "$attrs" || key === "$parent" || key === "$descriptor" || key === "$model" || key === "$body") continue;
      const entry: unknown = (element as unknown as Record<string, unknown>)[key];
      if (Array.isArray(entry)) {
        entry.forEach((item, index) => {
          if (isModdleElement(item)) visit(item, `${path}.${key}[${index}]`, id);
        });
      } else if (isModdleElement(entry)) {
        visit(entry, f1ChildPath(path, key), id);
      }
    }
  };
  visit(root, "$", undefined);
}
