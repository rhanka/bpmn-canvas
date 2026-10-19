import type { IoErrorCode } from "./errors.js";
import type { BpmnDefinitions, ModdleElement } from "../types.js";
import {
  F1_LIMITS,
  F1BoundaryError,
  f1Pointer,
  assertF1Encodable,
  assertF1AttributeNamespaces,
  assertF1NativeObjectSize,
  classifyF1AttributeName,
  f1NamespaceScope,
  isF1QName,
  isF1ReservedName,
} from "./f1-extensions.js";

import type { F1Diagnostic } from "./f1-extensions.js";

export interface BpmnXmlOptions {
  readonly format: boolean;
  readonly preamble: boolean;
}

/** F7: terminal native XML writer. Descriptors belong to the input's factory; options are explicit.
 * Integrity checks do not lint, repair, lay out or infer render data. No F1/XML-reader dependency.
 */
export async function serializeBpmn(definitions: BpmnDefinitions, options: BpmnXmlOptions): Promise<Uint8Array> {
  return (await serializeBpmnWithDiagnostics(definitions, options)).bytes;
}

/** Native writer bytes plus observable normalization losses. */
export async function serializeBpmnWithDiagnostics(definitions: BpmnDefinitions, options: BpmnXmlOptions): Promise<{ bytes: Uint8Array; diagnostics: readonly F1Diagnostic[] }> {
  if (!options || typeof options.format !== "boolean" || typeof options.preamble !== "boolean" ||
    Object.keys(options).some((k) => k !== "format" && k !== "preamble")) {
    throw new F1BoundaryError("invalid-configuration", "", "Expected explicit format and preamble booleans");
  }
  const writerOptions = { format: options.format, preamble: options.preamble };
  if (definitions?.$type !== "bpmn:Definitions") throw new F1BoundaryError("not-bpmn", "", "Expected bpmn:Definitions");
  const diagnostics = validateWriterInput(definitions);
  assertF1NativeObjectSize(definitions);
  try {
    const { xml } = await definitions.$model.toXML(definitions, writerOptions);
    return { bytes: new TextEncoder().encode(xml), diagnostics };
  } catch (error) {
    throw new F1BoundaryError("invalid-xml", "", `Native XML writer failed: ${String(error)}`);
  }
}

interface Property {
  name: string;
  ns: { name: string };
  type: string;
  isId?: boolean;
  isMany?: boolean;
  isReference?: boolean;
  isVirtual?: boolean;
  isAttr?: boolean;
}
function validateWriterInput(root: BpmnDefinitions): F1Diagnostic[] {
  const diagnostics: F1Diagnostic[] = [];
  let currentPath: (string | number)[] = [];
  let nearestId: string | undefined;
  let bindings = new Map<string, string>();
  const factory = root.$model;
  if (!root.$descriptor || typeof factory?.toXML !== "function" || typeof factory?.create !== "function") {
    throw new F1BoundaryError("invalid-model", "", "Expected native moddle definitions");
  }
  const seen = new Set<ModdleElement>(), byId = new Map<string, ModdleElement>();
  const references: { target: unknown; property: Property; owner: ModdleElement; path: (string | number)[]; id: string | undefined }[] = [];
  const packages = factory.getPackages() as { prefix: string; uri: string; xml?: { typePrefix?: string }; enumerations?: { name: string; literalValues: { name: string }[] }[] }[];
  const namespaces = new Map(packages.map((p) => [p.prefix, p.uri]));
  namespaces.set("xsi", "http://www.w3.org/2001/XMLSchema-instance");
  const enums = new Map(packages.flatMap((p) => (p.enumerations ?? []).map((e) => [e.name.includes(":") ? e.name : `${p.prefix}:${e.name}`, new Set(e.literalValues.map((v) => v.name))] as const)));
  namespaces.set("xml", "http://www.w3.org/XML/1998/namespace");
  const refuse = (code: IoErrorCode, message: string, _element: ModdleElement): never => { throw new F1BoundaryError(code, f1Pointer(currentPath), message, nearestId ? [nearestId] : []); };
  const matches = (e: ModdleElement, type: string): boolean => type === "Element" || e.$instanceOf(type);
  const encodable = (value: unknown, element: ModdleElement): void => {
    if (typeof value !== "string") return;
    try {
      assertF1Encodable(value);
    } catch {
      refuse("invalid-xml-character", "Unencodable string cannot be written", element);
    }
  };
  const checkAttributeEntry = (key: string, value: unknown, element: ModdleElement): void => {
    if (isF1ReservedName(key)) refuse("reserved-name", `Reserved attribute name ${key}`, element);
    if (typeof value !== "string") refuse("invalid-value", `Invalid attribute ${key}`, element);
    if (key.length > F1_LIMITS.maxAttributeUtf16Units || (value as string).length > F1_LIMITS.maxAttributeUtf16Units) {
      refuse("xml-attribute-length-limit", `Attribute ${key} exceeds 1048576 UTF-16 units`, element);
    }
    if (classifyF1AttributeName(key) === "malformed") refuse("malformed-qname", `Malformed attribute name ${key}`, element);
    const colon = key.indexOf(":");
    if (colon > 0 && !key.startsWith("xmlns:") && !bindings.has(key.slice(0, colon))) {
      refuse("unbound-prefix", "Foreign attribute has no namespace binding", element);
    }
    if (element.$descriptor.isGeneric && colon > 0 && !key.startsWith("xmlns:") && bindings.get(key.slice(0, colon)) === element.$descriptor.ns.uri) {
      diagnostics.push({ code: "moddle-content-normalized", path: f1Pointer(currentPath), ...(nearestId ? { target: nearestId } : {}), message: "Native writer removes a generic attribute prefix in the element namespace" });
    }
    encodable(value, element);
  };
  const GENERIC_RUNTIME_KEYS = new Set(["$type", "$parent", "$descriptor", "$model", "$body", "$children"]);
  function walk(element: ModdleElement, expectedType?: string, parent?: ModdleElement, depth = 1, segments: (string | number)[] = [], ancestorId?: string, outerBindings = namespaces): void {
    const previousPath = currentPath, previousId = nearestId, previousBindings = bindings;
    currentPath = segments;
    nearestId = typeof element?.id === "string" && element.id ? element.id : ancestorId;
    const generic = element?.$descriptor?.isGeneric === true;
    const attrs = generic ? element : element?.$attrs;
    bindings = f1NamespaceScope(outerBindings, attrs ?? {}, generic ? { qname: element.$type, uri: element.$descriptor.ns?.uri ?? "" } : undefined);
    try { visit(element, expectedType, parent, depth, segments); }
    finally { currentPath = previousPath; nearestId = previousId; bindings = previousBindings; }
  }
  function visit(element: ModdleElement, expectedType: string | undefined, parent: ModdleElement | undefined, depth: number, segments: (string | number)[]): void {
    if (depth > F1_LIMITS.maxDepth) refuse("xml-depth-limit", "Element nesting exceeds 256", element);
    // Generic descriptors carry name and namespace but no property tables.
    if (element?.$descriptor?.isGeneric === true) {
      const ns = element.$descriptor.ns;
      // The empty string is the no-namespace URI and writes unprefixed.
      if (typeof element.$type !== "string" || element.$descriptor.name !== element.$type ||
        !ns || (ns.uri !== undefined && typeof ns.uri !== "string") || typeof element.$instanceOf !== "function" || element.$model !== factory) {
        refuse("invalid-model", "Expected native generic objects from one descriptor factory", parent ?? root);
      }
      encodable(element.$type, element);
      encodable(ns.uri, element);
      for (const field of [ns.prefix, ns.localName, ns.name]) encodable(field, element);
      if (!isF1QName(element.$type)) refuse("malformed-qname", "Generic element name must be a QName", element);
    } else if (!element || typeof element !== "object" || !Array.isArray(element.$descriptor?.properties) ||
      !Array.isArray(element.$descriptor?.allTypes) || element.$descriptor.name !== element.$type ||
      typeof element.$instanceOf !== "function" || element.$model !== factory) {
      refuse("invalid-model", "Expected native objects from one descriptor factory", parent ?? root);
    }
    if (seen.has(element)) refuse("invalid-containment", "Shared or cyclic containment", element);
    seen.add(element);
    if (seen.size > F1_LIMITS.maxElements) refuse("xml-element-count-limit", "Document carries more than 1000000 elements", element);
    if ((expectedType && !matches(element, expectedType)) || (element.$parent !== undefined && element.$parent !== parent)) {
      refuse("invalid-containment", "Invalid containment type or parent", element);
    }
    const scope = bindings;
    if (element.$descriptor.isGeneric) {
      // C0: generic subtrees ride the unchanged native writer. Every
      // generic string passes the O1 gate; counts match the F1 limits.
      for (const key of ["get", "set", "$instanceOf"]) {
        const member = Object.getOwnPropertyDescriptor(element, key);
        if (member && (member.enumerable || typeof member.value !== "function")) {
          currentPath = [...segments, "$attrs", key];
          refuse("reserved-name", "Reserved foreign property", element);
        }
      }
      const names = Object.keys(element).filter((key) => !GENERIC_RUNTIME_KEYS.has(key));
      if (names.length > F1_LIMITS.maxAttributesPerElement) {
        refuse("xml-attribute-count-limit", "Element carries more than 1024 attributes", element);
      }
      for (const key of names) {
        currentPath = [...segments, "$attrs", key];
        checkAttributeEntry(key, element[key], element);
      }
      assertF1AttributeNamespaces(Object.fromEntries(names.map((key) => [key, element[key]])), scope);
      if (element.$body !== undefined) {
        currentPath = [...segments, "$body"];
        if (typeof element.$body !== "string") refuse("invalid-value", "Invalid generic body", element);
        encodable(element.$body, element);
      }
      currentPath = [...segments, "$children"];
      const children = element.$children ?? [];
      if (!Array.isArray(children)) refuse("invalid-value", "Invalid generic children", element);
      for (let i = 0; i < children.length; i++) walk(children[i] as ModdleElement, "Element", element, depth + 1, [...segments, "$children", i], nearestId, bindings);
      return;
    }
    if (element.$descriptor.allTypes.some((t: { name: string; isAbstract?: boolean }) => t.name === element.$type && t.isAbstract)) {
      refuse("unsupported-extension", "Abstract types cannot be written losslessly", element);
    }
    const properties = element.$descriptor.properties as Property[];
    const known = new Set(properties.map((p) => p.name));
    for (const key of Object.keys(element)) {
      currentPath = [...segments, key];
      if (!["$type", "$attrs", "$parent"].includes(key) && !known.has(key)) refuse(isF1ReservedName(key) ? "reserved-name" : "unknown-property", `Unknown property ${key}`, element);
    }
    currentPath = [...segments, "$attrs"];
    const attrKeys = Object.keys(element.$attrs ?? {});
    const typedAttrs = properties.filter((p) => p.isAttr && Object.hasOwn(element, p.name));
    if (attrKeys.length + typedAttrs.length > F1_LIMITS.maxAttributesPerElement) {
      refuse("xml-attribute-count-limit", "Element carries more than 1024 attributes", element);
    }
    for (const [key, value] of Object.entries(element.$attrs ?? {})) {
      currentPath = [...segments, "$attrs", key];
      if (key === "xsi:type") {
        const ns = element.$descriptor.ns;
        const pkg = packages.find((p) => p.prefix === ns.prefix);
        if (value !== `${ns.prefix}:${pkg?.xml?.typePrefix ?? ""}${ns.localName}`) refuse("invalid-xsi-type", "Conflicting xsi:type", element);
        continue;
      }
      checkAttributeEntry(key, value, element);
    }
    assertF1AttributeNamespaces(element.$attrs ?? {}, scope, properties.map((p) => p.ns.name), namespaces);
    for (const property of properties) {
      if (!Object.hasOwn(element, property.name)) continue;
      currentPath = [...segments, property.name];
      if (property.isVirtual) refuse("unsupported-structure", "Virtual properties would be omitted by XML", element);
      const value: unknown = element[property.name];
      if (property.isAttr && typeof value === "string" && value.length > F1_LIMITS.maxAttributeUtf16Units) {
        refuse("xml-attribute-length-limit", "Attribute value exceeds 1048576 UTF-16 units", element);
      }
      if (property.isMany && !Array.isArray(value)) refuse("invalid-value", `Expected array ${property.name}`, element);
      const values = property.isMany ? value as unknown[] : [value];
      for (let i = 0; i < values.length; i++) {
        currentPath = property.isMany ? [...segments, property.name, i] : [...segments, property.name];
        if (!Object.hasOwn(values, i)) refuse("invalid-value", "Sparse array", element);
        const v = values[i], type = property.type;
        if (property.isReference) references.push({ target: v, property, owner: element, path: currentPath, id: nearestId });
        else if (type === "String" || type === "Boolean" || type === "Integer" || type === "Real" || enums.has(type)) {
          const valid = type === "String" ? typeof v === "string" : type === "Boolean" ? typeof v === "boolean" :
            type === "Integer" ? typeof v === "number" && Number.isSafeInteger(v) :
              type === "Real" ? typeof v === "number" && Number.isFinite(v) && !Object.is(v, -0) : typeof v === "string" && enums.get(type)!.has(v);
          if (!valid || (property.isId && !v)) refuse("invalid-value", `Invalid ${property.name}`, element);
          if (typeof v === "string") encodable(v, element);
          if (property.isId) {
            if (byId.has(v as string)) refuse("duplicate-id", "Duplicate ID", element);
            byId.set(v as string, element);
          }
        } else walk(v as ModdleElement, type, element, depth + 1, currentPath, nearestId, bindings);
      }
    }
  }
  walk(root);
  for (const { target, property, owner, path, id } of references) {
    currentPath = path; nearestId = id;
    if (!target || typeof target !== "object" || typeof (target as ModdleElement).id !== "string" || !(target as ModdleElement).id) {
      refuse("invalid-reference", `Expected object reference ${property.name}`, owner);
    }
    const ref = target as ModdleElement, canonical = byId.get(ref.id);
    // Generic elements keep string IDs outside the typed index, so the
    // lookup below cannot see them: refuse them explicitly as targets.
    if (ref.$descriptor?.isGeneric) refuse("invalid-reference", `Generic target for ${property.name}`, owner);
    if (!canonical) refuse("dangling-reference", `Dangling ${property.name}`, owner);
    if (canonical !== ref || !matches(ref, property.type)) refuse("invalid-reference", `Detached or wrongly typed ${property.name}`, owner);
  }
  return diagnostics;
}
