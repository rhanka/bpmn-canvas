// BPMN -> page graph. Refuses unsupported semantics and missing DI. Adapted from an internal implementation.
import { IoError } from "./errors.js";
import type { IoOptions } from "./errors.js";
import { boundsOf, children, numberAttribute } from "./graph.js";
import type { GraphNode, GraphPage, NodeKind } from "./graph.js";
import { BPMNDI_NS, DC_NS, MODEL_NS, WAYPOINT_NS, nativeBpmnDocument } from "./xml.js";

const KIND_NAMES: NodeKind[] = [
  "participant",
  "lane",
  "task",
  "subProcess",
  "callActivity",
  "startEvent",
  "endEvent",
  "intermediateCatchEvent",
  "intermediateThrowEvent",
  "exclusiveGateway",
  "parallelGateway",
  "inclusiveGateway",
  "dataObjectReference",
  "textAnnotation",
];
const kinds: Record<string, NodeKind> = Object.fromEntries(KIND_NAMES.map((k) => [k, k]));
kinds["dataInput"] = "dataObjectReference";
kinds["dataOutput"] = "dataObjectReference";
const EDGE_NAMES = ["sequenceFlow", "association", "dataInputAssociation", "dataOutputAssociation"];
const supported = new Set([
  ...Object.keys(kinds),
  "definitions",
  "process",
  "collaboration",
  "laneSet",
  "flowNodeRef",
  ...EDGE_NAMES,
  "sourceRef",
  "targetRef",
  "incoming",
  "outgoing",
  "text",
  "property",
  "dataObject",
  "ioSpecification",
  "inputSet",
  "outputSet",
  "dataInputRefs",
  "dataOutputRefs",
  "terminateEventDefinition",
]);

export function bpmnGraph(xml: string, options?: IoOptions): GraphPage[] {
  const doc = nativeBpmnDocument(xml, options);
  const byId = new Map(Array.from(doc.querySelectorAll("[id]"), (e) => [e.id, e]));
  for (const e of children(doc, MODEL_NS, "*")) {
    if (!supported.has(e.localName)) throw new IoError("unsupported-element", `Draw.io projection does not support BPMN ${e.localName}`, [e.id]);
    if (e.parentElement?.localName === "subProcess" && kinds[e.localName]) {
      throw new IoError("nested-subprocess", "Draw.io projection does not support nested subprocess content", [e.id]);
    }
  }
  const covered = new Set<string>();
  const pages = children(doc, BPMNDI_NS, "BPMNDiagram").map((diagram): GraphPage => {
    const plane = children(diagram, BPMNDI_NS, "BPMNPlane")[0];
    const target = plane ? byId.get(plane.getAttribute("bpmnElement") || "") : undefined;
    if (!plane || !target) throw new IoError("unresolved-shape", `Diagram plane does not resolve: ${diagram.id}`, [diagram.id]);
    const process =
      target.localName === "process" ? target : byId.get(children(target, MODEL_NS, "participant")[0]?.getAttribute("processRef") || "");
    if (!process) throw new IoError("unresolved-shape", `Diagram has no process: ${diagram.id}`, [diagram.id]);
    const nodes = children(plane, BPMNDI_NS, "BPMNShape").map((shape): GraphNode => {
      const id = shape.getAttribute("bpmnElement") || "";
      const node = byId.get(id);
      const kind = node ? kinds[node.localName] : undefined;
      const bounds = children(shape, DC_NS, "Bounds")[0];
      if (!node || !kind || !bounds) throw new IoError("unresolved-shape", `Unsupported or unresolved shape: ${id}`, [id]);
      covered.add(id);
      return { id, kind, label: node.getAttribute("name") || children(node, MODEL_NS, "text")[0]?.textContent || "", bounds: boundsOf(bounds) };
    });
    const pool = nodes.find((n) => n.kind === "participant");
    if (nodes.filter((n) => n.kind === "participant").length > 1) {
      throw new IoError("multiple-participants", "Draw.io projection supports one participant per page", nodes.filter((n) => n.kind === "participant").map((n) => n.id));
    }
    for (const node of nodes) {
      if (node.kind === "participant") continue;
      const lane = nodes.find((n) => {
        const el = n.kind === "lane" ? byId.get(n.id) : undefined;
        return !!el && children(el, MODEL_NS, "flowNodeRef").some((ref) => ref.textContent === node.id);
      });
      node.parent = lane?.id || pool?.id;
    }
    const edges = children(plane, BPMNDI_NS, "BPMNEdge").map((di) => {
      const id = di.getAttribute("bpmnElement") || "";
      const edge = byId.get(id);
      if (!edge || !EDGE_NAMES.includes(edge.localName)) throw new IoError("unresolved-edge", `Unsupported or unresolved edge: ${id}`, [id]);
      covered.add(id);
      let source = edge.getAttribute("sourceRef") || children(edge, MODEL_NS, "sourceRef")[0]?.textContent || "";
      let target = edge.getAttribute("targetRef") || children(edge, MODEL_NS, "targetRef")[0]?.textContent || "";
      if (edge.localName === "dataInputAssociation") target = edge.parentElement?.id || "";
      if (edge.localName === "dataOutputAssociation") source = edge.parentElement?.id || "";
      if (!nodes.some((n) => n.id === source) || !nodes.some((n) => n.id === target)) throw new IoError("missing-endpoint", `Missing edge endpoint: ${id}`, [id]);
      const points = children(di, WAYPOINT_NS, "waypoint").map((p) => ({ x: numberAttribute(p, "x"), y: numberAttribute(p, "y") }));
      if (points.length < 2) throw new IoError("missing-waypoints", `Missing edge waypoints: ${id}`, [id]);
      return {
        id,
        kind: edge.localName === "sequenceFlow" ? ("sequenceFlow" as const) : ("association" as const),
        label: edge.getAttribute("name") || "",
        source,
        target,
        points,
      };
    });
    return { id: diagram.id, name: diagram.getAttribute("name") || process.getAttribute("name") || "Process", nodes, edges };
  });
  for (const e of children(doc, MODEL_NS, "*")) {
    if ((kinds[e.localName] || EDGE_NAMES.includes(e.localName)) && !covered.has(e.id)) {
      throw new IoError("element-without-di", `Element without DI cannot be projected: ${e.id || e.localName}`, e.id ? [e.id] : []);
    }
  }
  return pages;
}
