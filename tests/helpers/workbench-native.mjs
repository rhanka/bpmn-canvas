import { createModdle } from "../../dist/io/index.js";

// Hand-built native model: no F1, layout, colorizer or compatibility export as oracle.
export function nativeModel() {
  const m = createModdle();
  const create = (type, attrs = {}) => m.create(type, attrs);
  const definitions = create("bpmn:Definitions", { id: "Defs_Booklet", targetNamespace: "urn:example:booklet", rootElements: [], diagrams: [] });
  definitions.$attrs["xmlns:sem"] = "https://sentropic.com/schema/bpmn/semantics/1";
  const process = create("bpmn:Process", { id: "Process_Booklet", isExecutable: false, flowElements: [], laneSets: [] });
  const second = create("bpmn:Process", { id: "Process_Lantern", name: "Lantern", flowElements: [] });
  const start = create("bpmn:StartEvent", { id: "Start_Booklet", parallelMultiple: false, isInterrupting: true });
  const task = create("bpmn:Task", { id: "Task_Fold", name: "Fold é 🪁\n1.0 01 ٢ & < > \"", isForCompensation: false, startQuantity: 1, completionQuantity: 1 });
  const end = create("bpmn:EndEvent", { id: "End_Booklet" });
  const first = create("bpmn:SequenceFlow", { id: "Flow_First", sourceRef: start, targetRef: task, conditionExpression: create("bpmn:FormalExpression", { body: "x < 2 && y > 0" }) });
  const last = create("bpmn:SequenceFlow", { id: "Flow_Last", sourceRef: task, targetRef: end });
  start.outgoing = [first]; task.incoming = [first]; task.outgoing = [last]; end.incoming = [last];
  const lane = create("bpmn:Lane", { id: "Lane_Fold", name: "Review", flowNodeRef: [task, start, end] });
  const laneSet = create("bpmn:LaneSet", { id: "Lanes_Booklet", lanes: [lane] });
  const info = create("sem:Info", { order: 2, laneRef: lane, direction: "input", label: "01", primaryAssociationRef: first, processRef: second });
  task.extensionElements = create("bpmn:ExtensionElements", { values: [info] });
  task.documentation = [create("bpmn:Documentation", { text: "Line one\nLine two <keep> & exact", textFormat: "text/plain" })];
  process.flowElements = [start, task, end, first, last]; process.laneSets = [laneSet];
  definitions.rootElements = [process, second];
  const shape = create("bpmndi:BPMNShape", { id: "Shape_Fold", bpmnElement: task, bounds: create("dc:Bounds", { x: 12.5, y: 20.25, width: 100, height: 80 }), fill: "#f0f8ff", stroke: "#123456", "background-color": "#abcdef" });
  const edge = create("bpmndi:BPMNEdge", { id: "Edge_First", bpmnElement: first, waypoint: [create("dc:Point", { x: 1.5, y: 2.5 }), create("dc:Point", { x: 5, y: 8 })] });
  const plane = create("bpmndi:BPMNPlane", { id: "Plane_Booklet", bpmnElement: process, planeElement: [shape, edge] });
  const secondPlane = create("bpmndi:BPMNPlane", { id: "Plane_Lantern", bpmnElement: second, planeElement: [] });
  definitions.diagrams = [create("bpmndi:BPMNDiagram", { id: "Diagram_Booklet", plane }), create("bpmndi:BPMNDiagram", { id: "Diagram_Lantern", plane: secondPlane })];
  // Set parent mechanics independently, following native descriptor containment only.
  function parents(e) {
    for (const p of e.$descriptor.properties) {
      if (p.isReference || p.isVirtual || !Object.hasOwn(e, p.name)) continue;
      for (const child of [].concat(e[p.name])) if (child?.$descriptor) { child.$parent = e; parents(child); }
    }
  }
  parents(definitions);
  return { m, definitions, process, second, start, task, end, first, last, lane, info, shape, edge };
}

export const xmlOptions = Object.freeze({ format: true, preamble: true });
