// Page graph -> Draw.io (uncompressed). Adapted from an internal implementation.
import { resolveIoOptions } from "./errors.js";
import type { IoOptions } from "./errors.js";
import { addXml } from "./graph.js";
import type { GraphPage, NodeKind } from "./graph.js";

export const DRAWIO_STYLES: Record<NodeKind, string> = {
  participant: "swimlane;horizontal=0;startSize=30;",
  lane: "swimlane;horizontal=0;startSize=30;",
  task: "shape=mxgraph.bpmn.task;taskMarker=abstract;",
  subProcess: "shape=mxgraph.bpmn.task;taskMarker=abstract;isLoopSub=1;",
  callActivity: "shape=mxgraph.bpmn.task;taskMarker=abstract;strokeWidth=3;",
  startEvent: "shape=mxgraph.bpmn.event;outline=standard;symbol=general;",
  endEvent: "shape=mxgraph.bpmn.event;outline=end;symbol=general;",
  intermediateCatchEvent: "shape=mxgraph.bpmn.event;outline=catching;symbol=general;",
  intermediateThrowEvent: "shape=mxgraph.bpmn.event;outline=throwing;symbol=general;",
  exclusiveGateway: "shape=mxgraph.bpmn.gateway2;gwType=exclusive;",
  parallelGateway: "shape=mxgraph.bpmn.gateway2;gwType=parallel;",
  inclusiveGateway: "shape=mxgraph.bpmn.gateway2;gwType=inclusive;",
  dataObjectReference: "shape=mxgraph.bpmn.data;",
  textAnnotation: "shape=note;",
};

/** No stored artifact and no label-based identity: the captured graph is serialized as is. */
export function encodeDrawio(pages: GraphPage[], options?: IoOptions): string {
  const { host, kindAttribute } = resolveIoOptions(options);
  const doc = document.implementation.createDocument(null, "mxfile");
  doc.documentElement.setAttribute("host", host);
  doc.documentElement.setAttribute("compressed", "false");
  for (const page of pages) {
    const diagram = addXml(doc.documentElement, "diagram", { id: page.id, name: page.name });
    const root = addXml(addXml(diagram, "mxGraphModel"), "root");
    addXml(root, "mxCell", { id: "0" });
    addXml(root, "mxCell", { id: "1", parent: "0" });
    for (const node of page.nodes) {
      const parent = page.nodes.find((n) => n.id === node.parent);
      const cell = addXml(root, "mxCell", {
        id: `n-${node.id}`,
        parent: parent ? `n-${parent.id}` : "1",
        vertex: "1",
        value: node.label,
        [kindAttribute]: node.kind,
        style: `${DRAWIO_STYLES[node.kind]}whiteSpace=wrap;html=0;`,
      });
      addXml(cell, "mxGeometry", {
        as: "geometry",
        x: node.bounds.x - (parent?.bounds.x || 0),
        y: node.bounds.y - (parent?.bounds.y || 0),
        width: node.bounds.width,
        height: node.bounds.height,
      });
    }
    for (const edge of page.edges) {
      const style = edge.kind === "sequenceFlow" ? "endArrow=block;" : "dashed=1;endArrow=none;";
      const cell = addXml(root, "mxCell", {
        id: `e-${edge.id}`,
        parent: "1",
        edge: "1",
        value: edge.label,
        [kindAttribute]: edge.kind,
        source: `n-${edge.source}`,
        target: `n-${edge.target}`,
        style: `edgeStyle=orthogonalEdgeStyle;html=0;${style}`,
      });
      const geometry = addXml(cell, "mxGeometry", { as: "geometry", relative: "1" });
      const first = edge.points[0];
      const last = edge.points[edge.points.length - 1];
      if (first) addXml(geometry, "mxPoint", { as: "sourcePoint", ...first });
      if (last) addXml(geometry, "mxPoint", { as: "targetPoint", ...last });
      const array = addXml(geometry, "Array", { as: "points" });
      for (const point of edge.points.slice(1, -1)) addXml(array, "mxPoint", point);
    }
  }
  return new XMLSerializer().serializeToString(doc);
}
