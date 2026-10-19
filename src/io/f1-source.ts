import { Parser } from "saxen";
import { F1BoundaryError, f1Pointer, isF1NumericReference, isF1ReservedName, splitF1QName } from "./f1-extensions.js";
import type { F1Diagnostic } from "./f1-extensions.js";

interface Property {
  name: string; type: string; isMany?: boolean; isAttr?: boolean; isBody?: boolean;
  isReference?: boolean; isVirtual?: boolean;
  xml?: { serialize?: string };
}
interface Descriptor {
  properties: Property[]; propertiesByName: Record<string, Property>;
}
interface Factory {
  getPackages(): { prefix: string; uri: string; xml?: { tagAlias?: string; typePrefix?: string } }[];
  getType(name: string): { $descriptor: Descriptor; hasType(name: string): boolean };
}
interface Node {
  name: string; attrs: Record<string, string>; ns: Record<string, string>;
}
interface Frame {
  path: (string | number)[]; target?: string; descriptor?: Descriptor;
  generic: boolean; counts: Map<string, number>; text: boolean; children: boolean;
}

/** Observe coordinates and losses only; native parsing still owns the model.
 * No source payload, token stream or reconstruction metadata escapes the call.
 */
export function observeF1Source(text: string, factory: Factory): { losses: F1Diagnostic[]; reserved?: F1BoundaryError; entity?: F1BoundaryError } {
  const packages = factory.getPackages();
  const uriMap = Object.fromEntries(packages.map((p) => [p.uri, p.prefix]));
  uriMap["http://www.w3.org/2001/XMLSchema-instance"] = "xsi";
  uriMap["http://www.w3.org/XML/1998/namespace"] = "xml";
  const stack: Frame[] = [];
  const losses: F1Diagnostic[] = [];
  let reserved: F1BoundaryError | undefined, entity: F1BoundaryError | undefined;
  const diagnostic = (frame: Frame, path: readonly (string | number)[], message: string): void => {
    losses.push({ code: "moddle-content-normalized", path: f1Pointer(path), ...(frame.target ? { target: frame.target } : {}), message });
  };
  const references = (raw: string, frame: Frame, path: readonly (string | number)[]): void => {
    for (const match of raw.matchAll(/&([^&;\s<>]+);/g)) {
      const body = match[1]!;
      if (!body.startsWith("#")) {
        if (!["amp", "lt", "gt", "quot", "apos", "AMP", "LT", "GT", "QUOT", "APOS"].includes(body) && !entity) {
          entity = new F1BoundaryError("xml-entity-reference-unsupported", f1Pointer(path), "Undeclared named reference is refused", frame.target ? [frame.target] : []);
        }
        continue;
      }
      if (!isF1NumericReference(body)) {
        if (!entity) entity = new F1BoundaryError("xml-entity-reference-unsupported", f1Pointer(path), "Undeclared numeric reference is refused", frame.target ? [frame.target] : []);
        continue;
      }
      const value = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      if (value > 0 && value <= 0xffff && !(value >= 0xd800 && value <= 0xdfff) && value !== 0xfffe && value !== 0xffff) continue;
      diagnostic(frame, path, "Numeric reference is truncated or XML-invalid in the native tree");
    }
  };
  const typeFor = (node: Node): string | undefined => {
    const { prefix, localName } = splitF1QName(node.name);
    const pkg = packages.find((p) => p.prefix === prefix);
    if (!pkg) return undefined;
    const first = localName.charCodeAt(0);
    const name = pkg.xml?.tagAlias === "lowerCase" && first >= 97 && first <= 122 ? String.fromCharCode(first - 32) + localName.slice(1) : localName;
    return `${prefix}:${name}`;
  };
  const parser = new Parser({ proxy: true }).ns(uriMap);
  parser.on("openTag", (node: Node, decode: (v: string) => string, _closed: boolean, context: () => { data: string }) => {
    const parent = stack.at(-1);
    let type = typeFor(node), property: Property | undefined;
    let path: (string | number)[] = [];
    let generic = parent?.generic ?? false;
    if (parent) {
      parent.children = true;
      if (parent.generic) {
        const index = parent.counts.get("$children") ?? 0;
        parent.counts.set("$children", index + 1);
        path = [...parent.path, "$children", index];
      } else {
        const d = parent.descriptor;
        const direct = d?.propertiesByName[node.name];
        if (direct && !direct.isAttr) property = direct;
        if (!property && type) {
          try {
            const candidate = factory.getType(type);
            property = d?.properties.find((p) => !p.isVirtual && !p.isReference && !p.isAttr && candidate.hasType(p.type));
          } catch { type = undefined; }
        }
        if (!property && !type) property = d?.properties.find((p) => !p.isReference && !p.isAttr && p.type === "Element");
        if (property) {
          path = [...parent.path, property.name];
          if (property.isMany) {
            const index = parent.counts.get(property.name) ?? 0;
            parent.counts.set(property.name, index + 1);
            path.push(index);
          }
          if (property.xml?.serialize === "xsi:type" && node.attrs["xsi:type"]) {
            const qualified = splitF1QName(decode(node.attrs["xsi:type"]));
            const prefix = node.ns[qualified.prefix] ?? qualified.prefix;
            const pkg = packages.find((p) => p.prefix === prefix);
            const local = qualified.localName.startsWith(pkg?.xml?.typePrefix ?? "") ? qualified.localName.slice(pkg?.xml?.typePrefix?.length ?? 0) : qualified.localName;
            type = `${prefix}:${local}`;
          } else if (direct) type = direct.type;
          generic = property.type === "Element" && !type;
        } else {
          // Unmapped XML remains document-scoped; never invent a tree path.
          path = [];
        }
      }
    }
    let descriptor: Descriptor | undefined;
    if (!generic && type) {
      try { descriptor = factory.getType(type).$descriptor; } catch { /* native reader diagnoses unknown types */ }
    }
    const frame: Frame = { path, generic, counts: new Map(), text: false, children: false, ...(descriptor ? { descriptor } : {}), ...(parent?.target ? { target: parent.target } : {}) };
    // Read raw attribute names from this one tokenizer event. The tokenizer's
    // attribute map may already hide a prototype hook; this scan precedes any
    // native element construction and never assigns foreign keys to objects.
    const attrs = [...context().data.matchAll(/([^\s=<>/]+)\s*=\s*("[^"]*"|'[^']*')/g)];
    const id = attrs.find((a) => a[1] === "id");
    if (id) frame.target = decode(id[2]!.slice(1, -1));
    for (const attr of attrs) {
      const key = attr[1]!, raw = attr[2]!.slice(1, -1);
      const p = descriptor?.propertiesByName[key] ?? descriptor?.propertiesByName[node.name.split(":")[0] + ":" + key];
      const attrPath = [...path, ...(p ? [p.name] : ["$attrs", key])];
      if (isF1ReservedName(key) && !reserved) reserved = new F1BoundaryError("reserved-name", f1Pointer([...path, "$attrs", key]), "Reserved attribute name collides before native construction", frame.target ? [frame.target] : []);
      references(raw, frame, attrPath);
      const value = decode(raw);
      if (p?.type === "Integer" && String(Number.parseInt(value, 10)) !== value && Number.parseInt(value, 10) !== Number(value)) {
        diagnostic(frame, attrPath, "Native Integer coercion changes the source value");
      } else if (p?.type === "Real" && Number.parseFloat(value) !== Number(value)) {
        diagnostic(frame, attrPath, "Native Real coercion changes the source value");
      } else if (p?.type === "Boolean" && value !== "true" && value !== "false") {
        diagnostic(frame, attrPath, "Native Boolean coercion changes the source value");
      }
    }
    stack.push(frame);
  });
  parser.on("text", (raw: string) => {
    const frame = stack.at(-1);
    if (!frame) return;
    const body = frame.descriptor?.properties.find((p) => p.isBody);
    references(raw, frame, [...frame.path, ...(frame.generic ? ["$body"] : body ? [body.name] : [])]);
    if (raw.trim()) frame.text = true;
  });
  parser.on("cdata", (raw: string) => { if (raw && stack.at(-1)) stack.at(-1)!.text = true; });
  parser.on("closeTag", () => {
    const frame = stack.pop();
    if (frame?.generic && frame.text && frame.children) diagnostic(frame, frame.path, "Generic body text and child order cannot both survive the native tree");
  });
  // Malformed XML is still diagnosed by the native reader. Preserve any
  // coordinates observed before the tokenizer stopped.
  parser.on("error", () => parser.stop());
  parser.parse(text);
  return { losses, ...(reserved ? { reserved } : {}), ...(entity ? { entity } : {}) };
}
