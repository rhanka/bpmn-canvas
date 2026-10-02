// Native BPMN checks shared by import and export. Adapted from an internal implementation.
import { loadViewer } from "../internal/engine.js";
import { IoError, resolveIoOptions } from "./errors.js";
import type { IoOptions } from "./errors.js";

export const MODEL_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL";
export const BPMNDI_NS = "http://www.omg.org/spec/BPMN/20100524/DI";
export const DC_NS = "http://www.omg.org/spec/DD/20100524/DC";
export const WAYPOINT_NS = "http://www.omg.org/spec/DD/20100524/DI";

/** Bounded, no DTD and no entities. Needs a DOM (a browser, or jsdom). */
export function parseDiagramXml(xml: string, options?: IoOptions): Document {
  const { maxBytes } = resolveIoOptions(options);
  if (new TextEncoder().encode(xml).length > maxBytes) throw new IoError("too-large", `Diagram exceeds ${Math.round(maxBytes / 1048576)} MiB`);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new IoError("dtd", "DTD and entities are not supported");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new IoError("invalid-xml", "Invalid XML");
  return doc;
}

export function diagramElements(doc: Document): Element[] {
  return Array.from(doc.getElementsByTagNameNS(BPMNDI_NS, "BPMNDiagram"));
}

export function nativeBpmnDocument(xml: string, options?: IoOptions): Document {
  const doc = parseDiagramXml(xml, options);
  const ids = new Set<string>();
  for (const e of Array.from(doc.querySelectorAll("[id]"))) {
    const id = e.getAttribute("id") ?? "";
    if (!id || ids.has(id)) throw new IoError("duplicate-id", `Duplicate or empty ID: ${id}`, id ? [id] : []);
    ids.add(id);
  }
  if (doc.documentElement.namespaceURI !== MODEL_NS || doc.documentElement.localName !== "definitions") {
    throw new IoError("not-bpmn", "Expected BPMN2 XML. EA projects and XMI are not supported");
  }
  const resolvable = diagramElements(doc).filter((d) => {
    const ref = d.getElementsByTagNameNS(BPMNDI_NS, "BPMNPlane")[0]?.getAttribute("bpmnElement");
    return !!ref && ids.has(ref);
  });
  if (!doc.getElementsByTagNameNS(MODEL_NS, "process").length || !resolvable.length) {
    throw new IoError("missing-di", "BPMN must contain a process and diagram interchange (DI)");
  }
  return doc;
}

/** Imports every diagram in an off-screen viewer before the document is accepted. Returns the input unchanged. */
export async function validateNativeBpmn(xml: string, options?: IoOptions): Promise<string> {
  const doc = nativeBpmnDocument(xml, options);
  const Viewer = await loadViewer();
  const viewer = new Viewer({ container: document.createElement("div") });
  try {
    for (const diagram of diagramElements(doc)) {
      const { warnings } = await viewer.importXML(xml, diagram.getAttribute("id") ?? undefined);
      const first = warnings[0];
      if (first) throw new IoError("import-warning", `BPMN import warning: ${String(first.message ?? first)}`);
    }
  } finally {
    viewer.destroy();
  }
  return xml;
}
