/**
 * Draw.io and Sparx codecs. Needs a browser DOM (or jsdom); not part of the framework-free root entry.
 * A conversion either keeps what it declares in `fidelity` or refuses with a typed `IoError`.
 */
import { decodeDrawio } from "./drawio-decode.js";
import { encodeDrawio } from "./drawio-encode.js";
import { IoError } from "./errors.js";
import type { FidelityNotice, IoOptions } from "./errors.js";
import { graphBpmn } from "./build.js";
import { bpmnGraph } from "./project.js";
import { nativeBpmnDocument, parseDiagramXml, validateNativeBpmn } from "./xml.js";

export type ExportFormat = "bpmn" | "drawio" | "sparx";

export interface DiagramFile {
  readonly xml: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly fidelity: readonly FidelityNotice[];
}

const PROJECTION: FidelityNotice = {
  code: "projection",
  message: "Draw.io is a projection of the BPMN model: only the supported elements, their labels and their geometry are exported.",
};
const INTERCHANGE: FidelityNotice = {
  code: "interchange-only",
  message: "Sparx accepts BPMN 2.0 XML as an interchange format. No EA/XMI conversion is performed; the complete XML and its diagram interchange are kept.",
};

/** `bpmn` and `sparx` return the exact input bytes. `drawio` projects the model or refuses. */
export function exportDiagram(xml: string, format: ExportFormat, options?: IoOptions): DiagramFile {
  nativeBpmnDocument(xml, options);
  if (format === "drawio") {
    return { xml: encodeDrawio(bpmnGraph(xml, options), options), filename: "diagram.drawio", mimeType: "application/vnd.jgraph.mxfile", fidelity: [PROJECTION] };
  }
  return {
    xml,
    filename: format === "sparx" ? "diagram.sparx.xml" : "diagram.bpmn",
    mimeType: "application/bpmn+xml",
    fidelity: format === "sparx" ? [INTERCHANGE] : [],
  };
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
