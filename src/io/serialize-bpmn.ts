import { IoError } from "./errors.js";
import type { IoErrorCode } from "./errors.js";
import type { BpmnDefinitions, ModdleElement } from "../types.js";

export interface BpmnXmlOptions {
  readonly format: boolean;
  readonly preamble: boolean;
}

/** F7: terminal native XML writer. Descriptors belong to the input's factory; options are explicit.
 * Integrity checks do not lint, repair, lay out or infer render data. No F1/XML-reader dependency.
 */
export async function serializeBpmn(definitions: BpmnDefinitions, options: BpmnXmlOptions): Promise<Uint8Array> {
  if (!options || typeof options.format !== "boolean" || typeof options.preamble !== "boolean" ||
    Object.keys(options).some((k) => k !== "format" && k !== "preamble")) {
    throw new IoError("invalid-configuration", "Expected explicit format and preamble booleans");
  }
  const writerOptions = { format: options.format, preamble: options.preamble };
  if (definitions?.$type !== "bpmn:Definitions") throw new IoError("not-bpmn", "Expected bpmn:Definitions");
  validateWriterInput(definitions);
  try {
    const { xml } = await definitions.$model.toXML(definitions, writerOptions);
    return new TextEncoder().encode(xml);
  } catch (error) {
    throw new IoError("invalid-xml", `Native XML writer failed: ${String(error)}`);
  }
}

interface Property {
  name: string;
  type: string;
  isId?: boolean;
  isMany?: boolean;
  isReference?: boolean;
  isVirtual?: boolean;
}
function validateWriterInput(root: BpmnDefinitions): void {
  const factory = root.$model;
  if (!root.$descriptor || typeof factory?.toXML !== "function" || typeof factory?.create !== "function") {
    throw new IoError("invalid-model", "Expected native moddle definitions");
  }
  const seen = new Set<ModdleElement>(), byId = new Map<string, ModdleElement>();
  const references: { target: unknown; property: Property; owner: ModdleElement }[] = [];
  const packages = factory.getPackages() as { prefix: string; uri: string; xml?: { typePrefix?: string }; enumerations?: { name: string; literalValues: { name: string }[] }[] }[];
  const namespaces = new Map(packages.map((p) => [p.prefix, p.uri]));
  namespaces.set("xsi", "http://www.w3.org/2001/XMLSchema-instance");
  const enums = new Map(packages.flatMap((p) => (p.enumerations ?? []).map((e) => [e.name.includes(":") ? e.name : `${p.prefix}:${e.name}`, new Set(e.literalValues.map((v) => v.name))] as const)));
  const refuse = (code: IoErrorCode, message: string, element: ModdleElement): never => { throw new IoError(code, message, typeof element.id === "string" ? [element.id] : []); };
  const matches = (e: ModdleElement, type: string): boolean => type === "Element" || e.$instanceOf(type);
  function walk(element: ModdleElement, expectedType?: string, parent?: ModdleElement): void {
    if (!element || typeof element !== "object" || !Array.isArray(element.$descriptor?.properties) ||
      !Array.isArray(element.$descriptor?.allTypes) || element.$descriptor.name !== element.$type ||
      typeof element.$instanceOf !== "function" || element.$model !== factory) {
      refuse("invalid-model", "Expected native objects from one descriptor factory", parent ?? root);
    }
    if (seen.has(element)) refuse("invalid-containment", "Shared or cyclic containment", element);
    seen.add(element);
    if ((expectedType && !matches(element, expectedType)) || (element.$parent !== undefined && element.$parent !== parent)) {
      refuse("invalid-containment", "Invalid containment type or parent", element);
    }
    if (element.$descriptor.isGeneric || element.$descriptor.allTypes.some((t: { name: string; isAbstract?: boolean }) => t.name === element.$type && t.isAbstract)) {
      refuse("unsupported-extension", "Generic or abstract types cannot be written losslessly", element);
    }
    const properties = element.$descriptor.properties as Property[];
    const known = new Set(properties.map((p) => p.name));
    for (const key of Object.keys(element)) {
      if (!["$type", "$attrs", "$parent"].includes(key) && !known.has(key)) refuse("unknown-property", `Unknown property ${key}`, element);
    }
    for (const [key, value] of Object.entries(element.$attrs ?? {})) {
      if (key === "xsi:type") {
        const ns = element.$descriptor.ns;
        const pkg = packages.find((p) => p.prefix === ns.prefix);
        if (value !== `${ns.prefix}:${pkg?.xml?.typePrefix ?? ""}${ns.localName}`) refuse("unsupported-extension", "Conflicting xsi:type", element);
        continue;
      }
      const prefix = key.startsWith("xmlns:") ? key.slice(6) : key === "xmlns" ? "bpmn" : undefined;
      const unqualified = /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key) && key !== "xmlns" && !known.has(key) && typeof value === "string";
      if (!unqualified && (prefix === undefined || value !== namespaces.get(prefix))) refuse("unsupported-extension", `Unsupported attribute or namespace ${key}`, element);
    }
    for (const property of properties) {
      if (!Object.hasOwn(element, property.name)) continue;
      if (property.isVirtual) refuse("unsupported-structure", "Virtual properties would be omitted by XML", element);
      const value: unknown = element[property.name];
      if (property.isMany && !Array.isArray(value)) refuse("invalid-value", `Expected array ${property.name}`, element);
      const values = property.isMany ? value as unknown[] : [value];
      for (let i = 0; i < values.length; i++) {
        if (!Object.hasOwn(values, i)) refuse("invalid-value", "Sparse array", element);
        const v = values[i], type = property.type;
        if (property.isReference) references.push({ target: v, property, owner: element });
        else if (type === "String" || type === "Boolean" || type === "Integer" || type === "Real" || enums.has(type)) {
          const valid = type === "String" ? typeof v === "string" : type === "Boolean" ? typeof v === "boolean" :
            type === "Integer" ? typeof v === "number" && Number.isSafeInteger(v) :
              type === "Real" ? typeof v === "number" && Number.isFinite(v) && !Object.is(v, -0) : typeof v === "string" && enums.get(type)!.has(v);
          if (!valid || (property.isId && !v)) refuse("invalid-value", `Invalid ${property.name}`, element);
          if (property.isId) {
            if (byId.has(v as string)) refuse("duplicate-id", "Duplicate ID", element);
            byId.set(v as string, element);
          }
        } else walk(v as ModdleElement, type, element);
      }
    }
  }
  walk(root);
  for (const { target, property, owner } of references) {
    if (!target || typeof target !== "object" || typeof (target as ModdleElement).id !== "string" || !(target as ModdleElement).id) {
      refuse("invalid-reference", `Expected object reference ${property.name}`, owner);
    }
    const ref = target as ModdleElement, canonical = byId.get(ref.id);
    if (!canonical) refuse("dangling-reference", `Dangling ${property.name}`, owner);
    if (canonical !== ref || !matches(ref, property.type)) refuse("invalid-reference", `Detached or wrongly typed ${property.name}`, owner);
  }
}
