/**
 * Direct moddle exports run in Node and browsers; legacy graph import/projection codecs use a DOM.
 * A conversion either keeps what it declares in `fidelity` or refuses with a typed `IoError`.
 */
import { decodeDrawio } from "./drawio-decode.js";
import { encodeDrawio } from "./drawio-encode.js";
import { IoError } from "./errors.js";
import type { FidelityNotice, IoOptions } from "./errors.js";
import { BpmnModdle } from "bpmn-moddle";
import semantics from "./semantics.json" with { type: "json" };
import type { BpmnDefinitions, ModdleElement } from "../types.js";
import { containedElements, readReferencePages, validateSemantics } from "./reference-model.js";
import { referenceDrawio } from "./reference-drawio.js";
import { referenceSparx } from "./reference-sparx.js";
import { graphBpmn } from "./build.js";
import { bpmnGraph } from "./project.js";
import { BPMNDI_NS, nativeBpmnDocument, parseDiagramXml, validateNativeBpmn } from "./xml.js";

export type ExportFormat = "bpmn" | "drawio" | "sparx";

export interface DiagramFile {
  readonly xml: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly fidelity: readonly FidelityNotice[];
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const v of Object.values(value)) freeze(v); Object.freeze(value); }
  return value;
}
export const semanticDescriptor = freeze(semantics);
export const semanticsChecksum = "c274f46f773b5f557f7995fa70aae9d8a50384aedfcc6c3a5d166563a17a7c97";
/** Public moddle operations, independent of the upstream package's untyped declarations. */
export interface ModdleModel {
  create<T extends ModdleElement = ModdleElement>(type: string, attributes?: Record<string, unknown>): T;
  fromXML(xml: string, options?: { lax?: boolean }): Promise<ParsedDefinitions>;
  toXML(element: ModdleElement, options?: { format?: boolean; preamble?: boolean }): Promise<{ xml: string }>;
}
export function createModdle(): ModdleModel { return new BpmnModdle({ sem: structuredClone(semanticDescriptor) }); }
export interface ParsedDefinitions {
  readonly rootElement: BpmnDefinitions;
  readonly elementsById: Readonly<Record<string, ModdleElement>>;
  readonly warnings: readonly unknown[];
}
/** Descriptor-aware parse: required semantic facts may not disappear as reader warnings. */
export async function parseDefinitions(xml: string): Promise<ParsedDefinitions> {
  if (/<!DOCTYPE/i.test(xml)) throw new IoError("dtd", "DTD is not supported");
  // Use the registered reader's exact tag/attribute resolution, but retain order as a String.
  // This covers Info/info and qualified aliases without Integer coercion erasing wire values.
  const lexicalDescriptor = structuredClone(semanticDescriptor);
  lexicalDescriptor.types[0]!.properties.find((p) => p.name === "order")!.type = "String";
  let wire;
  try { wire = await new BpmnModdle({ sem: lexicalDescriptor }).fromXML(xml); }
  catch (error) { throw new IoError("invalid-xml", String(error)); }
  for (const e of containedElements(wire.rootElement)) for (const v of e.extensionElements?.values ?? []) {
    if (v.$type !== "sem:Info" || v.order === undefined) continue;
    const lexical = v.order.trim();
    if (!/^[+-]?\d+$/.test(lexical) || !Number.isSafeInteger(Number(lexical)) || Number(lexical) < 0) throw new IoError("invalid-semantics", "Order must be a nonnegative integer", [e.id]);
  }
  // Some upstream generic readers lose a URI when an unknown namespace shadows
  // a registered prefix. Give unknown declarations canonical prefixes in the final
  // reader; their resolved descriptors then retain the URI independently of scope.
  // Declarations come from parsed model attributes, so comments cannot create them.
  const nsMap: Record<string, string> = {};
  const knownUris = new Set(new BpmnModdle({ sem: structuredClone(semanticDescriptor) }).getPackages().map((p: { uri: string }) => p.uri));
  for (const e of containedElements(wire.rootElement)) for (const [key, uri] of Object.entries(e.$descriptor?.isGeneric ? e : e.$attrs ?? {})) {
    if ((key === "xmlns" || key.startsWith("xmlns:")) && typeof uri === "string" && !knownUris.has(uri) && !nsMap[uri]) nsMap[uri] = `extension${Object.keys(nsMap).length}`;
  }
  let parsed;
  try { parsed = await new BpmnModdle({ sem: structuredClone(semanticDescriptor) }, { nsMap }).fromXML(xml); }
  catch (error) { throw new IoError("invalid-xml", String(error)); }
  const root = parsed.rootElement as BpmnDefinitions;
  // Required namespace versions are checked on resolved model extensions, not text.
  validateSemantics(root);
  if (parsed.warnings.length) {
    const w = parsed.warnings[0] as { message: string; element?: ModdleElement; context?: { element?: ModdleElement } };
    throw new IoError("invalid-semantics", w.message, [w.element?.id ?? w.context?.element?.id ?? root.id ?? ""]);
  }
  return parsed as ParsedDefinitions;
}
export interface CodecConfiguration {
  readonly host?: string;
  readonly drawio?: { readonly agent?: string };
  readonly sparx?: { readonly exporter?: string; readonly exporterVersion?: string };
}
let fixedConfig: Readonly<CodecConfiguration> | undefined;
const resolveConfig = (c: CodecConfiguration): CodecConfiguration => ({ host: c.host ?? "bpmn-canvas", drawio: { ...(c.drawio?.agent !== undefined ? { agent: c.drawio.agent } : {}) }, sparx: { exporter: c.sparx?.exporter ?? "bpmn-canvas", exporterVersion: c.sparx?.exporterVersion ?? "0.4.0" } });
/** Initialize once, identically in browser and Node. Caller mutation cannot change the envelope. */
export function initializeCodecs(configuration: CodecConfiguration = {}): void {
  const resolved = resolveConfig(configuration);
  if (fixedConfig && JSON.stringify(resolved) !== JSON.stringify(fixedConfig)) throw new IoError("invalid-configuration", "Codec configuration is already initialized differently");
  fixedConfig ??= freeze(resolved);
}
/** Existing-consumer adapter. Workbench proofs use the separately exported native functions.
 * Never parse XML, normalize, lay out or read side facts here.
 */
async function exportModel(definitions: BpmnDefinitions, format: ExportFormat): Promise<Uint8Array> {
  if (definitions?.$type !== "bpmn:Definitions") throw new IoError("not-bpmn", "Expected moddle bpmn:Definitions");
  if (format === "bpmn") {
    const serialized = await createModdle().toXML(definitions, { format: true });
    return new TextEncoder().encode(serialized.xml);
  }
  if (format !== "drawio" && format !== "sparx") throw new IoError("unsupported-model", "Unknown export format");
  const pages = readReferencePages(definitions);
  const config = fixedConfig ??= freeze(resolveConfig({}));
  return new TextEncoder().encode(format === "drawio" ? referenceDrawio(pages, config) : referenceSparx(pages, config));
}
export { exportModel as export };

export interface DiagramSummary {
  readonly id: string;
  readonly name: string;
}

/** The diagrams of a document, in order, named by the diagram, else its process, else `Diagram N`. */
export function listDiagrams(xml: string, options?: IoOptions): DiagramSummary[] {
  const doc = parseDiagramXml(xml, options);
  const byId = new Map<string, Element>();
  for (const e of Array.from(doc.querySelectorAll("[id]"))) byId.set(e.getAttribute("id") ?? "", e);
  return Array.from(doc.getElementsByTagNameNS(BPMNDI_NS, "BPMNDiagram")).map((d, i) => {
    const plane = d.getElementsByTagNameNS(BPMNDI_NS, "BPMNPlane")[0];
    const target = byId.get(plane?.getAttribute("bpmnElement") ?? "");
    const participant = target?.localName === "collaboration" ? Array.from(target.children).find((c) => c.localName === "participant") : undefined;
    const process = participant ? byId.get(participant.getAttribute("processRef") ?? "") : target;
    return { id: d.getAttribute("id") ?? "", name: d.getAttribute("name") || process?.getAttribute("name") || `Diagram ${i + 1}` };
  });
}

export interface ImportResult {
  readonly xml: string;
  /** True when the input was Draw.io and the BPMN was regenerated from its graph. */
  readonly projected: boolean;
  readonly fidelity: readonly FidelityNotice[];
}

const REGENERATED: readonly FidelityNotice[] = [
  { code: "ids-regenerated", message: "BPMN element ids are regenerated from the Draw.io cells." },
  { code: "di-regenerated", message: "Diagram interchange is regenerated from the Draw.io geometry." },
  { code: "data-links-as-associations", message: "Data links become plain associations." },
  { code: "labels-reduced-to-text", message: "HTML labels are reduced to their text." },
];

/** Native BPMN is validated and returned unchanged. Draw.io is decoded and regenerated. */
export async function importDiagram(xml: string, options?: IoOptions): Promise<ImportResult> {
  const doc = parseDiagramXml(xml, options);
  const projected = doc.documentElement.localName === "mxfile";
  const candidate = projected ? graphBpmn(await decodeDrawio(xml, options), options) : xml;
  return { xml: await validateNativeBpmn(candidate, options), projected, fidelity: projected ? REGENERATED : [] };
}

export { IoError, decodeDrawio, encodeDrawio, bpmnGraph, graphBpmn, nativeBpmnDocument, parseDiagramXml, validateNativeBpmn };
export type { FidelityNotice, IoOptions };
export type { IoErrorCode } from "./errors.js";
export type { GraphEdge, GraphNode, GraphPage, NodeKind } from "./graph.js";

export type { BpmnDefinitions, ModdleElement } from "../types.js";
export { hydrate, project, projectWithDiagnostics, parseF1Xml, ModdleJsonError } from "./moddle-json.js";
export type { JsonCodecConfiguration, ModdleDescriptor, ModdleJsonElement, ModdleJsonValue, F1ParseResult } from "./moddle-json.js";
export {
  F1_LIMITS,
  F1_ENCODING_REGISTRY,
  F1_RESERVED_NAMES,
  F1BoundaryError,
  assertF1Encodable,
  assertF1InputSize,
  assertF1TagIntegrity,
  assertF1XmlSafety,
  canonicalJsonBytes,
  capF1Warnings,
  classifyF1AttributeName,
  classifyF1Warning,
  decodeF1Bytes,
  f1Pointer,
  isF1EncodingFallbackWarning,
  isF1QName,
  isF1ReservedName,
  nativeElementPaths,
  scanF1ReservedAttributes,
  scanF1XmlLosses,
  splitF1QName,
} from "./f1-extensions.js";
export type { F1Diagnostic, F1EncodingEntry } from "./f1-extensions.js";
export { serializeBpmn, serializeBpmnWithDiagnostics } from "./serialize-bpmn.js";
export { f1DiagnosticEntry } from "./f1-report.js";
export type { BpmnXmlOptions } from "./serialize-bpmn.js";
