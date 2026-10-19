import { IoError } from "./errors.js";
import type { IoErrorCode } from "./errors.js";
import { Parser, decode } from "saxen";

/**
 * F1 extension-preservation boundary.
 *
 * C0: preserve exactly the tree produced by the pinned native reader/writer,
 * including generic elements, foreign attributes, retained namespace
 * declarations and resolved xsi:type. Anything the native libraries drop is
 * reported here as a typed diagnostic; nothing is silently ignored. The XML
 * reader/writer stay the unchanged native implementations: this module only
 * observes bounded tokenizer events and scans decoded text, never retaining
 * a token stream or reconstruction metadata.
 */

/** Typed F1 detail. `path` is an RFC 6901 pointer (`""` = whole document). */
export interface F1Diagnostic {
  readonly code: string;
  readonly path: string;
  readonly target?: string;
  readonly message: string;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}

/** Frozen F1 resource limits. Object size is UTF-8 bytes of the JCS form. */
export const F1_LIMITS = deepFreeze({
  maxRawBytes: 64 * 1024 * 1024,
  maxDecodedBytes: 64 * 1024 * 1024,
  maxObjectBytes: 64 * 1024 * 1024,
  maxDepth: 256,
  maxElements: 1000000,
  maxAttributesPerElement: 1024,
  maxAttributeUtf16Units: 1048576,
  maxWarnings: 1000,
});

// Conversion-local presence metadata shared only with boundary measurements.
export const F1_EXPLICIT_ATTRS = Symbol("explicit-json-attrs");
export const F1_WIRE_NAMES = Symbol("explicit-json-property-names");

/** Observe the pinned tokenizer before the native reader allocates a tree. */
export function assertF1XmlLimits(text: string): void {
  let depth = 0, elements = 0;
  const parser = new Parser();
  parser.on("openTag", (_name, attributes, decode) => {
    if (++depth > F1_LIMITS.maxDepth) throw new IoError("xml-depth-limit", "Element nesting exceeds 256");
    if (++elements > F1_LIMITS.maxElements) throw new IoError("xml-element-count-limit", "Document carries more than 1000000 elements");
    const attrs = attributes();
    const names = Object.keys(attrs);
    if (names.length > F1_LIMITS.maxAttributesPerElement) throw new IoError("xml-attribute-count-limit", "Element carries more than 1024 attributes");
    for (const name of names) {
      if (name.length > F1_LIMITS.maxAttributeUtf16Units || decode(attrs[name]!).length > F1_LIMITS.maxAttributeUtf16Units) {
        throw new IoError("xml-attribute-length-limit", "Attribute name or value exceeds 1048576 UTF-16 units");
      }
    }
  });
  parser.on("closeTag", () => { depth--; });
  // Malformed XML remains the native reader's responsibility. No tree or
  // lexical payload is retained by this observer.
  parser.on("error", () => {});
  parser.parse(text);
}

export interface F1EncodingEntry {
  readonly encoding: "UTF-8" | "ISO-8859-1";
  readonly labels: readonly string[];
}

/**
 * Explicit input-encoding registry. Only UTF-8 (the XML default, including
 * an explicitly declared one) and declared ISO-8859-1 are supported; every
 * other label is refused. ISO-8859-1 uses the true byte to U+0000..U+00FF
 * mapping below, never a platform decoder. Emitted bytes always follow the
 * native writer (UTF-8).
 */
export const F1_ENCODING_REGISTRY: readonly F1EncodingEntry[] = deepFreeze([
  { encoding: "UTF-8", labels: ["utf-8", "utf8"] },
  { encoding: "ISO-8859-1", labels: ["iso-8859-1", "latin1"] },
]);

/**
 * Closed reserved-name union for foreign attributes and properties. JS wire
 * and runtime names plus the Python members from the plan step-1 note, so
 * both lanes refuse the same collisions. Schema-owned fields stay allowed
 * only in their defined positions. Never discovered dynamically.
 */
export const F1_RESERVED_NAMES: readonly string[] = deepFreeze([
  "$type",
  "$attrs",
  "$body",
  "$children",
  "$parent",
  "$descriptor",
  "$model",
  "$instanceOf",
  "hasType",
  "get",
  "set",
  "then",
  "constructor",
  "prototype",
  "__proto__",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toString",
  "toLocaleString",
  "valueOf",
  "type_",
  "attrs_",
  "parent_",
  "model_",
  "descriptor_",
  "instance_of",
  "to_canonical_dict",
  "__class__",
  "__contains__",
  "__delattr__",
  "__dict__",
  "__dir__",
  "__doc__",
  "__eq__",
  "__format__",
  "__ge__",
  "__getattribute__",
  "__getitem__",
  "__gt__",
  "__hash__",
  "__init__",
  "__le__",
  "__lt__",
  "__module__",
  "__ne__",
  "__new__",
  "__reduce__",
  "__reduce_ex__",
  "__repr__",
  "__setattr__",
  "__setitem__",
  "__sizeof__",
  "__str__",
  "__subclasshook__",
  "__weakref__",
]);

const RESERVED = new Set<string>(F1_RESERVED_NAMES);

export function isF1ReservedName(name: string): boolean {
  return RESERVED.has(name);
}

/**
 * XML 1.0 Namespaces name check without any case mapping: pure code-point
 * range tests over NameStartChar/NameChar (4th edition and later). Astral
 * planes are read as scalar values; lone surrogates never match a range.
 */
function isF1NameStart(code: number): boolean {
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a) || code === 0x5f ||
    (code >= 0xc0 && code <= 0xd6) || (code >= 0xd8 && code <= 0xf6) || (code >= 0xf8 && code <= 0x2ff) ||
    (code >= 0x370 && code <= 0x37d) || (code >= 0x37f && code <= 0x1fff) ||
    code === 0x200c || code === 0x200d || (code >= 0x2070 && code <= 0x218f) ||
    (code >= 0x2c00 && code <= 0x2fef) || (code >= 0x3001 && code <= 0xd7ff) ||
    (code >= 0xf900 && code <= 0xfdcf) || (code >= 0xfdf0 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0xeffff);
}

function isF1NameChar(code: number): boolean {
  return isF1NameStart(code) || code === 0x2d || code === 0x2e ||
    (code >= 0x30 && code <= 0x39) || code === 0xb7 ||
    (code >= 0x300 && code <= 0x36f) || (code >= 0x203f && code <= 0x2040);
}

/** True for an NCName (a Name without a colon). Empty is never a name. */
function isF1NcName(value: string): boolean {
  if (!value) return false;
  let first = true;
  for (let index = 0; index < value.length;) {
    const code = value.codePointAt(index)!;
    if (first ? !isF1NameStart(code) : !isF1NameChar(code)) return false;
    first = false;
    index += code > 0xffff ? 2 : 1;
  }
  return true;
}

function isXmlnsDeclaration(name: string): boolean {
  if (name === "xmlns") return true;
  if (!name.startsWith("xmlns:")) return false;
  return isF1NcName(name.slice("xmlns:".length));
}

/** True for a well-formed (optionally prefixed) QName. Unprefixed is allowed. */
export function isF1QName(value: string): boolean {
  const parts = value.split(":");
  return parts.length <= 2 && parts.every(isF1NcName);
}

/**
 * Refuse reserved names in attribute position before native construction.
 * The quote-aware tag scan excludes text, comments, PIs, CDATA and values.
 */
export function scanF1ReservedAttributes(text: string): void {
  assertF1TagIntegrity(text, true);
}

export type F1AttributeKind = "xmlns-default" | "xmlns-prefixed" | "qualified" | "unqualified" | "malformed";

/** Classify a foreign attribute key. Reserved names are checked separately. */
export function classifyF1AttributeName(name: string): F1AttributeKind {
  if (name === "xmlns") return "xmlns-default";
  if (name.startsWith("xmlns:")) return isXmlnsDeclaration(name) ? "xmlns-prefixed" : "malformed";
  if (isF1QName(name)) return name.includes(":") ? "qualified" : "unqualified";
  return "malformed";
}

/** Split a validated QName into prefix/local name. No prefix means `""`. */
export function splitF1QName(qname: string): { prefix: string; localName: string } {
  const separator = qname.indexOf(":");
  return separator < 0 ? { prefix: "", localName: qname } : { prefix: qname.slice(0, separator), localName: qname.slice(separator + 1) };
}

/** Resolve retained declarations in their local scope; default namespaces
 * apply to element identities only, never to unprefixed attributes. */
export function f1NamespaceScope(parent: ReadonlyMap<string, string>, attrs: Record<string, unknown>, name?: { qname: string; uri: string }): Map<string, string> {
  const scope = new Map(parent);
  scope.set("xml", "http://www.w3.org/XML/1998/namespace");
  if (name) scope.set(splitF1QName(name.qname).prefix, name.uri);
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value !== "string") continue;
    if (key === "xmlns") scope.set("", value);
    else if (key.startsWith("xmlns:")) {
      const prefix = key.slice(6);
      if (prefix === "xml" && value !== scope.get("xml")) throw new IoError("invalid-namespace", "The xml namespace cannot be rebound");
      scope.set(prefix, value);
    }
  }
  return scope;
}

/** Reject aliases that address the same expanded attribute or a declared
 * property. Unresolved opaque JSON attributes are left to the writer gate. */
export function assertF1AttributeNamespaces(attrs: Record<string, unknown>, scope: ReadonlyMap<string, string>, declared: readonly string[] = [], packages: ReadonlyMap<string, string> = scope): void {
  const expanded = new Set<string>();
  const properties = new Set(declared.map((name) => {
    const { prefix, localName } = splitF1QName(name);
    return JSON.stringify([packages.get(prefix) ?? "", localName]);
  }));
  for (const key of Object.keys(attrs)) {
    if (key === "xmlns" || key.startsWith("xmlns:") || !isF1QName(key)) continue;
    const { prefix, localName } = splitF1QName(key);
    const uri = prefix ? scope.get(prefix) : "";
    if (uri === undefined) continue;
    const name = JSON.stringify([uri, localName]);
    if (expanded.has(name) || (prefix && properties.has(name))) throw new IoError("duplicate-attribute", "Attributes collide by expanded name");
    expanded.add(name);
  }
}

/** Build an RFC 6901 pointer segment by segment (`~` to `~0`, `/` to `~1`). */
export function f1Pointer(segments: readonly (string | number)[]): string {
  return segments.map((segment) => `/${String(segment).replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
}

/** Keep the legacy display path while quoting opaque property segments. */
export function f1ChildPath(path: string, key: string): string {
  return /^[$A-Za-z_][$A-Za-z_0-9:-]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

export function f1PathPointer(path: string): string {
  if (path === "" || path.startsWith("/")) return path;
  const segments: (string | number)[] = [];
  const parts = /\.([^.[\]]+)|\[(\d+|"(?:[^"\\]|\\.)*")\]/g;
  let match: RegExpExecArray | null;
  while ((match = parts.exec(path)) !== null) {
    segments.push(match[1] ?? (match[2]!.startsWith('"') ? JSON.parse(match[2]!) as string : Number(match[2])));
  }
  return f1Pointer(segments);
}

/** Refusal carrying a structural path. Thrown before native construction. */
export class F1BoundaryError extends IoError {
  readonly path: string;
  constructor(code: IoErrorCode, path: string, message: string, ids: readonly string[] = []) {
    super(code, message, ids);
    this.path = path;
  }
  get diagnostic(): { code: string; path: string } {
    return { code: this.code, path: f1PathPointer(this.path) };
  }
}

/** Raw byte ceiling, checked before any other work. */
export function assertF1InputSize(bytes: Uint8Array): void {
  if (bytes.length > F1_LIMITS.maxRawBytes) {
    throw new IoError("xml-input-size-limit", `Input exceeds ${F1_LIMITS.maxRawBytes} bytes`);
  }
}

const ENCODING_DECLARATION = /[\t\r\n ]encoding[\t\r\n ]*=[\t\r\n ]*["']([^"']+)["']/;

function lookupEncoding(label: string | undefined): "UTF-8" | "ISO-8859-1" | null {
  if (label === undefined) return "UTF-8";
  const normalized = label.trim().toLowerCase();
  for (const entry of F1_ENCODING_REGISTRY) {
    if ((entry.labels as readonly string[]).includes(normalized)) return entry.encoding;
  }
  return null;
}

/** Decode raw bytes with the registry mapping. Never a platform ISO decoder. */
export function decodeF1Bytes(bytes: Uint8Array): { text: string; encoding: "UTF-8" | "ISO-8859-1" } {
  assertF1InputSize(bytes);
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  let declaration = "";
  if (bytes[start] === 0x3c && bytes[start + 1] === 0x3f && bytes[start + 2] === 0x78 &&
    bytes[start + 3] === 0x6d && bytes[start + 4] === 0x6c && [0x20, 0x09, 0x0a, 0x0d].includes(bytes[start + 5]!)) {
    for (let end = start + 6; end + 1 < bytes.length; end++) {
      if (bytes[end] === 0x3f && bytes[end + 1] === 0x3e) {
        declaration = new TextDecoder().decode(bytes.subarray(start, end + 2));
        break;
      }
    }
  }
  const encoding = lookupEncoding(ENCODING_DECLARATION.exec(declaration)?.[1]);
  if (encoding === null) throw new IoError("unsupported-encoding", "Unsupported declared input encoding");
  if (encoding === "UTF-8") {
    const stripped = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.slice(3) : bytes;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(stripped);
      if (new TextEncoder().encode(text).length > F1_LIMITS.maxDecodedBytes) {
        throw new IoError("xml-input-size-limit", "Decoded input exceeds 64 MiB");
      }
      return { text, encoding };
    } catch (error) {
      if (error instanceof IoError) throw error;
      throw new IoError("invalid-encoding", "Input is not well-formed UTF-8");
    }
  }
  let text = "";
  for (let index = 0; index < bytes.length; index++) text += String.fromCharCode(bytes[index]!);
  if (new TextEncoder().encode(text).length > F1_LIMITS.maxDecodedBytes) {
    throw new IoError("xml-input-size-limit", "Decoded input exceeds 64 MiB");
  }
  return { text, encoding };
}

const COMMENT = /<!--[\s\S]*?-->/g;
const PROCESSING_INSTRUCTION = /<\?[\s\S]*?\?>/g;
const CDATA_SECTION = /<!\[CDATA\[[\s\S]*?\]\]>/g;

/** Remove comments, PIs and CDATA so scans never read their payload text. */
function maskXmlMarkup(text: string): string {
  return text.replace(COMMENT, (match) => " ".repeat(match.length))
    .replace(PROCESSING_INSTRUCTION, (match) => " ".repeat(match.length))
    .replace(CDATA_SECTION, (match) => " ".repeat(match.length));
}

const DOCTYPE = /<!DOCTYPE[\s>/]/i;
const ENTITY_DECLARATION = /<!ENTITY[\s>/]/i;
// Capture the whole reference, including every Unicode XML Name character.
// The closed allowlist below also refuses malformed/unknown named forms.
const ENTITY_REFERENCE = /&([^&;\s<>]+);/g;
const DECODED_NAMED = new Set(["amp", "lt", "gt", "quot", "apos", "AMP", "LT", "GT", "QUOT", "APOS"]);

/**
 * Refuse DTD/ENTITY constructs and undeclared named references before
 * native model construction. Only the five predefined references (with the
 * native uppercase variants) and numeric references reach the native
 * decoder; XInclude, DTD expansion and network/schema resolution never run.
 */
export function assertF1XmlSafety(text: string): void {
  const masked = maskXmlMarkup(text);
  if (DOCTYPE.test(masked)) throw new IoError("xml-doctype-forbidden", "DOCTYPE declarations are refused");
  if (ENTITY_DECLARATION.test(masked)) throw new IoError("xml-entity-declaration-forbidden", "ENTITY declarations are refused");
  ENTITY_REFERENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ENTITY_REFERENCE.exec(masked)) !== null) {
    const body = match[1]!;
    if (isF1NumericReference(body) || DECODED_NAMED.has(body)) continue;
    throw new IoError("xml-entity-reference-unsupported", `Undeclared named reference &${body}; is refused`);
  }
}

/**
 * Fail-closed tag scan before native construction. Runs after the safety
 * scan (so DOCTYPE/ENTITY content is already gone) over markup-masked text:
 * a repeated attribute key in one start-tag refuses as `duplicate-key`
 * (`duplicate-namespace` when the repeated key declares a namespace), and
 * an element or attribute prefix with no in-scope `xmlns` binding refuses
 * as `unbound-prefix`. Nested shadowing of a prefix across elements stays
 * legal; only same-tag redeclaration refuses. Malformed tags bail silently
 * so the native reader still reports `xml-invalid`; values are never
 * interpolated into messages.
 */
export function assertF1TagIntegrity(text: string, checkReserved = false): void {
  const masked = maskXmlMarkup(text);
  const fail = (code: "duplicate-key" | "unbound-prefix" | "duplicate-namespace", message: string): never => {
    throw new IoError(code, message);
  };
  const isSpace = (char: string): boolean => char === " " || char === "\t" || char === "\n" || char === "\r";
  // In-scope prefix bindings with a change log, so closing an element
  // restores the outer scope in O(declarations) instead of O(depth).
  const bound = new Map<string, string>([["xml", "http://www.w3.org/XML/1998/namespace"]]);
  const changes: { prefix: string; had: boolean; value: string }[] = [];
  const checkpoints: number[] = [];
  const openTags: string[] = [];
  const restore = (checkpoint: number): void => {
    while (changes.length > checkpoint) {
      const change = changes.pop()!;
      if (change.had) bound.set(change.prefix, change.value);
      else bound.delete(change.prefix);
    }
  };
  const short = (name: string): string => (name.length > 64 ? `${name.slice(0, 64)}…` : name);
  let poisoned = false;
  let index = 0;
  while (index < masked.length) {
    const open = masked.indexOf("<", index);
    if (open < 0) break;
    let quote = "";
    let close = -1;
    for (let cursor = open + 1; cursor < masked.length; cursor++) {
      const char = masked[cursor]!;
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === "\"" || char === "'") {
        quote = char;
      } else if (char === ">") {
        close = cursor;
        break;
      }
    }
    if (close < 0) return;
    index = close + 1;
    const body = masked.slice(open + 1, close);
    if (!body || body[0] === "?" || body[0] === "!") continue;
    let cursor = 0;
    let isEnd = false;
    if (body[0] === "/") {
      isEnd = true;
      cursor = 1;
    }
    const nameStart = cursor;
    while (cursor < body.length && !isSpace(body[cursor]!) && body[cursor] !== "/") cursor++;
    const tagName = body.slice(nameStart, cursor);
    if (!tagName) return;
    if (isEnd) {
      if (openTags.length === 0) {
        poisoned = true;
        continue;
      }
      const top = openTags.pop()!;
      restore(checkpoints.pop()!);
      if (top !== tagName) poisoned = true;
      continue;
    }
    // Start-tag attributes, parsed quote-aware. Anything malformed bails
    // silently so the native reader reports xml-invalid instead.
    const names: string[] = [];
    const values: (string | null)[] = [];
    let malformed = false;
    while (cursor < body.length) {
      while (cursor < body.length && isSpace(body[cursor]!)) cursor++;
      if (cursor >= body.length || body[cursor] === "/") break;
      const keyStart = cursor;
      while (cursor < body.length && !isSpace(body[cursor]!) && body[cursor] !== "=" && body[cursor] !== "/" && body[cursor] !== ">") cursor++;
      const key = body.slice(keyStart, cursor);
      if (!key) {
        malformed = true;
        break;
      }
      if (checkReserved && isF1ReservedName(key)) {
        throw new IoError("reserved-name", "Reserved attribute name collides before native construction");
      }
      while (cursor < body.length && isSpace(body[cursor]!)) cursor++;
      let value: string | null = null;
      if (body[cursor] === "=") {
        cursor++;
        while (cursor < body.length && isSpace(body[cursor]!)) cursor++;
        const delimiter = body[cursor];
        if (delimiter !== "\"" && delimiter !== "'") {
          malformed = true;
          break;
        }
        cursor++;
        const valueStart = cursor;
        while (cursor < body.length && body[cursor] !== delimiter) cursor++;
        if (cursor >= body.length) {
          malformed = true;
          break;
        }
        value = body.slice(valueStart, cursor);
        cursor++;
      }
      // Bare attributes are malformed XML; the native reader reports them.
      if (value === null) {
        malformed = true;
        break;
      }
      names.push(key);
      values.push(value);
    }
    if (malformed) return;
    const selfClosing = /\/\s*$/.test(body);
    const seen = new Set<string>();
    for (const key of names) {
      if (seen.has(key)) {
        if (key === "xmlns" || key.startsWith("xmlns:")) {
          const prefix = key === "xmlns" ? "" : key.slice("xmlns:".length);
          fail("duplicate-namespace", prefix === "" ? "The default namespace is declared twice in one start-tag" : `Prefix ${short(prefix)} is declared twice in one start-tag`);
        }
        fail("duplicate-key", `Attribute ${short(key)} appears twice in one start-tag`);
      }
      seen.add(key);
    }
    if (!poisoned) {
      const checkpoint = changes.length;
      for (let position = 0; position < names.length; position++) {
        const key = names[position]!;
        const value = values[position]!;
        if (key === "xmlns") {
          if (value !== null) {
            changes.push({ prefix: "", had: bound.has(""), value: bound.get("") ?? "" });
            bound.set("", decode(value));
          }
        } else if (key.startsWith("xmlns:")) {
          const prefix = key.slice("xmlns:".length);
          if (prefix && !prefix.includes(":") && value !== null) {
            changes.push({ prefix, had: bound.has(prefix), value: bound.get(prefix) ?? "" });
            bound.set(prefix, decode(value));
          }
        }
      }
      const checkPrefix = (qualified: string, kind: string): void => {
        if (!isF1QName(qualified) || !qualified.includes(":")) return;
        const prefix = qualified.slice(0, qualified.indexOf(":"));
        if (prefix === "xml" || bound.has(prefix)) return;
        fail("unbound-prefix", `${kind} prefix ${short(prefix)} has no in-scope namespace declaration`);
      };
      checkPrefix(tagName, "Element");
      for (const key of names) {
        if (key === "xmlns" || key.startsWith("xmlns:")) continue;
        checkPrefix(key, "Attribute");
      }
      assertF1AttributeNamespaces(Object.fromEntries(names.map((name) => [name, ""])), bound);
      if (selfClosing) {
        restore(checkpoint);
      } else {
        checkpoints.push(checkpoint);
        openTags.push(tagName);
      }
    }
  }
}

/**
 * O1 string gate for every F1/F7 typed and generic string, applied before
 * encoding. Lone surrogates, NUL, forbidden XML controls and U+FFFE/U+FFFF
 * refuse; TAB/LF/CR and valid supplementary characters pass. The value is
 * never interpolated into the message.
 */
export function assertF1Encodable(value: string): void {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        index++;
        continue;
      }
      throw new IoError("invalid-xml-character", "Unpaired leading surrogate cannot be encoded");
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) throw new IoError("invalid-xml-character", "Unpaired trailing surrogate cannot be encoded");
    if (unit <= 0x08 || unit === 0x0b || unit === 0x0c || (unit >= 0x0e && unit <= 0x1f)) {
      throw new IoError("invalid-xml-character", "Forbidden XML control character cannot be encoded");
    }
    if (unit === 0xfffe || unit === 0xffff) throw new IoError("invalid-xml-character", "Noncharacter cannot be encoded");
  }
}

/** UTF-8 byte length of the JCS form (UTF-16 code-unit key order, no gaps). */
export function canonicalJsonBytes(value: unknown, ceiling = Infinity, view: (value: object) => object = (entry) => entry): number {
  let bytes = 0;
  const active = new Set<object>();
  type Frame = { source: object; value: object; keys: string[] | undefined; index: number; depth: number; nesting: number };
  const stack: Frame[] = [];
  let next = value, depth = 0, nesting = 0;
  for (;;) {
    if (typeof next === "string") bytes += jsonStringBytes(next);
    else if (typeof next !== "object" || next === null) bytes += (JSON.stringify(next) ?? "null").length;
    // Cycle diagnosis belongs to the structural walker, which retains its
    // exact property path. Sizing represents the repeated link as null.
    else if (active.has(next)) bytes += 4;
    else {
      const source = next;
      const entry = view(source);
      const elementDepth = depth + (typeof (entry as { $type?: unknown }).$type === "string" ? 1 : 0);
      if (elementDepth > F1_LIMITS.maxDepth || nesting > F1_LIMITS.maxDepth * 4) throw new IoError("xml-depth-limit", "Element nesting exceeds 256");
      active.add(source);
      bytes += 2;
      stack.push({ source, value: entry, keys: Array.isArray(entry) ? undefined : Object.keys(entry).sort(), index: 0, depth: elementDepth, nesting: nesting + 1 });
    }
    if (bytes > ceiling) return bytes;
    let advanced = false;
    while (stack.length) {
      const frame = stack[stack.length - 1]!;
      const length = frame.keys?.length ?? (frame.value as unknown[]).length;
      if (frame.index === length) { active.delete(frame.source); stack.pop(); continue; }
      if (frame.index) bytes++;
      const key = frame.keys?.[frame.index];
      next = key === undefined ? (frame.value as unknown[])[frame.index] : (frame.value as Record<string, unknown>)[key];
      if (key !== undefined) bytes += jsonStringBytes(key) + 1;
      frame.index++;
      depth = frame.depth; nesting = frame.nesting;
      advanced = true;
      break;
    }
    if (!advanced) return bytes;
  }
}

function jsonStringBytes(value: string): number {
  let bytes = 2;
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit === 0x22 || unit === 0x5c || unit === 8 || unit === 9 || unit === 10 || unit === 12 || unit === 13) bytes += 2;
    else if (unit < 0x20) bytes += 6;
    else if (unit < 0x80) bytes++;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
    else if (unit >= 0xd800 && unit <= 0xdfff) bytes += 6;
    else bytes += 3;
  }
  return bytes;
}

/** Measure the F1 JSON view lazily, excluding all native runtime links. */
export function assertF1NativeObjectSize(root: object): void {
  const bytes = canonicalJsonBytes(root, F1_LIMITS.maxObjectBytes, (entry) => {
    const element = entry as Record<string | symbol, any>;
    const descriptor = element.$descriptor;
    if (!descriptor) return entry;
    if (descriptor.isGeneric) {
      const attrs = Object.fromEntries(Object.keys(element).filter((key) => !["$type", "$parent", "$descriptor", "$model", "$body", "$children", "$instanceOf", "get", "set"].includes(key)).map((key) => [key, element[key]]));
      return { $type: "$any", $name: { qname: element.$type, uri: descriptor.ns?.uri ?? "" }, $attrs: attrs,
        ...(element.$body === undefined ? {} : { $body: element.$body }), ...(element.$children === undefined ? {} : { $children: element.$children }) };
    }
    const result: Record<string, unknown> = { $type: element.$type };
    if (Object.keys(element.$attrs ?? {}).length || element[F1_EXPLICIT_ATTRS]) result.$attrs = element.$attrs;
    for (const property of descriptor.properties) {
      const present = Object.hasOwn(element, property.name);
      if (!present && property.default === undefined) continue;
      const name = element[F1_WIRE_NAMES]?.[property.name] ?? property.name;
      const value = present ? element[property.name] : ["Real", "Integer"].includes(property.type) ? Number(property.default) : property.default;
      result[name] = property.isReference ? property.isMany ? value.map((ref: { id: string }) => ref.id) : value?.id : value;
    }
    return result;
  });
  if (bytes > F1_LIMITS.maxObjectBytes) throw new IoError("xml-input-size-limit", "Projected JSON exceeds 64 MiB");
}

interface NativeWarning {
  message?: unknown;
  element?: { id?: unknown };
  property?: unknown;
  context?: { element?: { id?: unknown } };
}

function warningTarget(warning: NativeWarning): { target?: string } {
  const id = warning.element?.id ?? warning.context?.element?.id;
  return typeof id === "string" && id ? { target: id } : {};
}

function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * True for the reader's encoding-fallback notice ("unsupported document
 * encoding <label>, falling back to UTF-8"). F1 decodes input bytes through
 * its own registry before the native reader ever runs, so this notice can
 * never describe a real fallback in the F1 flow; parseF1Xml drops it rather
 * than reporting decoding it already owns.
 */
export function isF1EncodingFallbackWarning(warning: unknown): boolean {
  return !!warning && typeof warning === "object" &&
    typeof (warning as NativeWarning).message === "string" &&
    ((warning as NativeWarning).message as string).startsWith("unsupported document encoding");
}

/**
 * Projected pointer per native element, keyed by object identity. Typed
 * containment follows descriptor property names (references skipped so one
 * object keeps one path); generic subtrees follow `$children`. Pointers use
 * the same domain as the projected JSON.
 */
export function nativeElementPaths(root: unknown): Map<object, string> {
  const paths = new Map<object, string>();
  const seen = new Set<object>();
  const visit = (element: unknown, pointer: string): void => {
    if (!element || typeof element !== "object" || seen.has(element)) return;
    seen.add(element);
    paths.set(element, pointer);
    if (Array.isArray(element)) {
      element.forEach((item, index) => visit(item, `${pointer}/${index}`));
      return;
    }
    const record = element as Record<string, unknown> & {
      $descriptor?: { isGeneric?: boolean; properties?: { name: string; isReference?: boolean; isVirtual?: boolean }[] };
    };
    const descriptor = record.$descriptor;
    if (descriptor?.isGeneric === true) {
      const children = record.$children;
      if (Array.isArray(children)) {
        children.forEach((item, index) => visit(item, `${pointer}/$children/${index}`));
      }
      return;
    }
    const properties = descriptor?.properties;
    if (!Array.isArray(properties)) return;
    for (const property of properties) {
      if (!property || typeof property.name !== "string" || property.isReference || property.isVirtual) continue;
      const value = record[property.name];
      if (value === undefined) continue;
      const segment = escapePointerSegment(property.name);
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (item && typeof item === "object") visit(item, `${pointer}/${segment}/${index}`);
        });
      } else if (value && typeof value === "object") {
        visit(value, `${pointer}/${segment}`);
      }
    }
  };
  visit(root, "");
  return paths;
}

/**
 * Map one native warning to its typed diagnostic. Unparsable content the
 * reader skipped is a drop at the document; warnings over retained data
 * stay warnings at the projected location of their element — an
 * unknown-attribute warning additionally names its `$attrs` entry. An
 * unreadable entry fails closed instead of being guessed. `elementPath` is
 * the precomputed projected pointer of the warning's element (`""` when the
 * warning carries no resolvable element).
 */
export function classifyF1Warning(warning: unknown, index: number, elementPath = ""): F1Diagnostic {
  if (!warning || typeof warning !== "object" || typeof (warning as NativeWarning).message !== "string") {
    return { code: "moddle-unmapped-diagnostic", path: "", message: `Native warning ${index} is not a readable warning` };
  }
  const message = ((warning as NativeWarning).message as string).split("\n")[0] ?? "";
  const target = warningTarget(warning as NativeWarning);
  if (message.startsWith("unparsable content")) {
    return { code: "moddle-content-dropped", path: "", message, ...target };
  }
  const property = (warning as NativeWarning).property;
  if (message.startsWith("unknown attribute <") && typeof property === "string" && property) {
    return { code: "moddle-warning", path: `${elementPath}/$attrs/${escapePointerSegment(property)}`, message, ...target };
  }
  return { code: "moddle-warning", path: elementPath, message, ...target };
}

/**
 * Cap native warnings at 1000 in document order. The overflow is replaced
 * by one shared truncation diagnostic at the projected location of the
 * first omitted warning. Pass the parsed root to resolve element locations;
 * without it every warning stays at the document.
 */
export function capF1Warnings(warnings: readonly unknown[], root?: unknown): { kept: F1Diagnostic[]; truncated: F1Diagnostic | null } {
  const paths = root === undefined ? null : nativeElementPaths(root);
  const ids = new Map<string, string>();
  for (const [element, path] of paths ?? []) {
    const id = (element as { id?: unknown }).id;
    if (typeof id === "string" && id) ids.set(path, id);
  }
  const locate = (warning: unknown): string | undefined => {
    if (!paths || !warning || typeof warning !== "object") return undefined;
    const element = (warning as NativeWarning).element ?? (warning as NativeWarning).context?.element;
    if (!element || typeof element !== "object") return undefined;
    return paths.get(element as object);
  };
  const classify = (warning: unknown, index: number): F1Diagnostic => {
    const path = locate(warning);
    const diagnostic = classifyF1Warning(warning, index, path ?? "");
    if (diagnostic.target !== undefined || path === undefined) return diagnostic;
    let ancestor = path;
    for (;;) {
      const target = ids.get(ancestor);
      if (target !== undefined) return { ...diagnostic, target };
      if (!ancestor) return diagnostic;
      ancestor = ancestor.slice(0, ancestor.lastIndexOf("/"));
    }
  };
  const kept = warnings.slice(0, F1_LIMITS.maxWarnings)
    .map(classify);
  if (warnings.length <= F1_LIMITS.maxWarnings) return { kept, truncated: null };
  const omitted = warnings[F1_LIMITS.maxWarnings];
  const first = classify(omitted, F1_LIMITS.maxWarnings);
  return {
    kept,
    truncated: {
      code: "moddle-warning-truncated",
      path: first.path,
      message: `Further native warnings are truncated after ${F1_LIMITS.maxWarnings}`,
      ...(first.target !== undefined ? { target: first.target } : {}),
    },
  };
}

const NUMERIC_REFERENCE = /&(#\d+|#[xX][0-9A-Fa-f]+);/g;

/** Strict numeric character-reference shape shared with the source observer. */
export function isF1NumericReference(body: string): boolean {
  return /^#(?:\d+|[xX][0-9A-Fa-f]+)$/.test(body);
}

function numericValue(body: string): number {
  return body.startsWith("#x") || body.startsWith("#X") ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
}

/**
 * Loss pre-scan over decoded text. Comments, processing instructions and
 * CDATA boundaries are discarded by the native reader; mixed text/child
 * ordering inside generic bodies is reported per node at projection time.
 * Numeric references the native decoder truncates or replaces (surrogate
 * halves, values past U+10FFFF, NUL) are recorded with their native
 * outcome; valid supplementary characters stay silent positives.
 */
export function scanF1XmlLosses(text: string, includeNumericReferences = true): F1Diagnostic[] {
  const losses: F1Diagnostic[] = [];
  const withoutCdata = text.replace(CDATA_SECTION, (match) => " ".repeat(match.length));
  const comments = withoutCdata.match(/<!--/g)?.length ?? 0;
  if (comments > 0) losses.push({ code: "moddle-content-normalized", path: "", message: `${comments} XML comment(s) are discarded by the native reader` });
  const instructions = withoutCdata.replace(/<\?xml[\s?]/, "     ").match(/<\?/g)?.length ?? 0;
  if (instructions > 0) losses.push({ code: "moddle-content-normalized", path: "", message: `${instructions} processing instruction(s) are discarded by the native reader` });
  const cdata = text.match(/<!\[CDATA\[/g)?.length ?? 0;
  if (cdata > 0) losses.push({ code: "moddle-content-normalized", path: "", message: `${cdata} CDATA section(s) lose their boundary in the native tree` });
  // parseF1Xml uses the descriptor-aware event observer for numeric locations.
  if (!includeNumericReferences) return losses;
  const masked = maskXmlMarkup(text);
  NUMERIC_REFERENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = NUMERIC_REFERENCE.exec(masked)) !== null) {
    const value = numericValue(match[1]!);
    // The native decoder keeps the low 16 bits (&#x1F600; becomes U+F600),
    // so every astral value truncates. BMP survivors outside the F7
    // encodable range (NUL, surrogate halves, U+FFFE/U+FFFF) are recorded
    // with their native outcome for the F7 refusal interaction.
    const survivor = value & 0xffff;
    const intact = value <= 0xffff && value > 0 && !(value >= 0xd800 && value <= 0xdfff) && value !== 0xfffe && value !== 0xffff;
    if (intact) continue;
    losses.push({
      code: "moddle-content-normalized",
      path: "",
      message: `Numeric reference &${match[1]}; decodes to U+${survivor.toString(16).toUpperCase().padStart(4, "0")} in the native tree and cannot be rewritten`,
    });
  }
  return losses;
}
