// Page graph -> BPMN: ids and DI are regenerated, data links become associations.
// Adapted from an internal implementation.
import { resolveIoOptions } from "./errors.js";
import type { IoOptions } from "./errors.js";
import { addXml } from "./graph.js";
import type { GraphPage } from "./graph.js";
import { BPMNDI_NS, DC_NS, MODEL_NS, WAYPOINT_NS } from "./xml.js";

export function graphBpmn(pages: GraphPage[], options?: IoOptions): string {
  const { targetNamespace } = resolveIoOptions(options);
  const doc = document.implementation.createDocument(MODEL_NS, "bpmn:definitions");
  const defs = doc.documentElement;
  const xmlns = "http://www.w3.org/2000/xmlns/";
  defs.setAttributeNS(xmlns, "xmlns:bpmn", MODEL_NS);
  defs.setAttributeNS(xmlns, "xmlns:bpmndi", BPMNDI_NS);
  defs.setAttributeNS(xmlns, "xmlns:dc", DC_NS);
  defs.setAttributeNS(xmlns, "xmlns:di", WAYPOINT_NS);
  defs.setAttribute("id", "Definitions_canvas_import");
  defs.setAttribute("targetNamespace", targetNamespace);
  const bpmn = (parent: Element, name: string, attrs: Record<string, string | number> = {}): Element => addXml(parent, `bpmn:${name}`, attrs, MODEL_NS);
  for (const page of pages) {
    const processId = `${page.id}_process`;
    const pool = page.nodes.find((n) => n.kind === "participant");
    if (pool) {
      const collab = bpmn(defs, "collaboration", { id: `${page.id}_collaboration` });
      bpmn(collab, "participant", { id: pool.id, name: pool.label || page.name, processRef: processId });
    }
    const process = bpmn(defs, "process", { id: processId, name: page.name, isExecutable: "false" });
    const lanes = page.nodes.filter((n) => n.kind === "lane");
    const laneSet = lanes.length ? bpmn(process, "laneSet", { id: `${page.id}_lanes` }) : null;
    for (const lane of lanes) {
      const el = bpmn(laneSet as Element, "lane", { id: lane.id, name: lane.label });
      for (const node of page.nodes.filter((n) => n.parent === lane.id && !["lane", "textAnnotation", "dataObjectReference"].includes(n.kind))) {
        bpmn(el, "flowNodeRef").textContent = node.id;
      }
    }
    // The OMG schema orders a process as: laneSet, every flow element, then every artifact
    // (text annotations and associations). Emitting an annotation before a flow is schema-invalid.
    const flowNodes = page.nodes.filter((n) => !["lane", "participant", "textAnnotation"].includes(n.kind));
    for (const node of flowNodes) {
      if (node.kind === "dataObjectReference") bpmn(process, "dataObject", { id: `${node.id}_object` });
      const attrs: Record<string, string> = { id: node.id, name: node.label };
      if (node.kind === "dataObjectReference") attrs["dataObjectRef"] = `${node.id}_object`;
      bpmn(process, node.kind, attrs);
    }
    for (const edge of page.edges.filter((e) => e.kind === "sequenceFlow")) {
      bpmn(process, "sequenceFlow", { id: edge.id, sourceRef: edge.source, targetRef: edge.target, name: edge.label });
    }
    for (const node of page.nodes.filter((n) => n.kind === "textAnnotation")) {
      const el = bpmn(process, "textAnnotation", { id: node.id });
      bpmn(el, "text").textContent = node.label;
    }
    for (const edge of page.edges.filter((e) => e.kind === "association")) {
      bpmn(process, "association", { id: edge.id, sourceRef: edge.source, targetRef: edge.target });
    }
  }
  // Diagram interchange comes after every root element (collaboration, process) of every page.
  for (const page of pages) {
    const processId = `${page.id}_process`;
    const pool = page.nodes.find((n) => n.kind === "participant");
    const diagram = addXml(defs, "bpmndi:BPMNDiagram", { id: `${page.id}_diagram`, name: page.name }, BPMNDI_NS);
    const plane = addXml(diagram, "bpmndi:BPMNPlane", { id: `${page.id}_plane`, bpmnElement: pool ? `${page.id}_collaboration` : processId }, BPMNDI_NS);
    for (const node of page.nodes) {
      const attrs: Record<string, string> = { id: `${node.id}_di`, bpmnElement: node.id };
      if (["participant", "lane"].includes(node.kind)) attrs["isHorizontal"] = "true";
      if (node.kind === "subProcess") attrs["isExpanded"] = "false";
      const shape = addXml(plane, "bpmndi:BPMNShape", attrs, BPMNDI_NS);
      addXml(shape, "dc:Bounds", node.bounds, DC_NS);
    }
    for (const edge of page.edges) {
      const di = addXml(plane, "bpmndi:BPMNEdge", { id: `${edge.id}_di`, bpmnElement: edge.id }, BPMNDI_NS);
      const points =
        edge.points.length >= 2
          ? edge.points
          : [edge.source, edge.target].map((id) => {
              const box = page.nodes.find((n) => n.id === id)?.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
              return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
            });
      for (const point of points) addXml(di, "di:waypoint", point, WAYPOINT_NS);
    }
  }
  return new XMLSerializer().serializeToString(doc);
}
