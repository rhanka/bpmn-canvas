import { descriptor, fixture, io, model, text } from "./semantic.mjs";

export async function choreographyXml() {
  const m = await model();
  const a = m.moddle.create("bpmn:Participant", { id: "Exchange_A", name: "Sender" });
  const b = m.moddle.create("bpmn:Participant", { id: "Exchange_B", name: "Receiver" });
  const flow = m.moddle.create("bpmn:MessageFlow", { id: "Exchange_message", sourceRef: a, targetRef: b });
  const page = m.moddle.create("bpmn:Choreography", { id: "Exchange_page", participants: [a, b], messageFlows: [flow] });
  m.definitions.rootElements.push(page);
  const shape = (e, x) => m.moddle.create("bpmndi:BPMNShape", { id: `${e.id}_di`, bpmnElement: e, bounds: m.moddle.create("dc:Bounds", { x, y: 0, width: 100, height: 60 }) });
  m.definitions.diagrams.push(m.moddle.create("bpmndi:BPMNDiagram", { id: "Exchange_diagram", plane: m.moddle.create("bpmndi:BPMNPlane", { id: "Exchange_plane", bpmnElement: page, planeElement: [shape(a, 0), shape(b, 200), m.moddle.create("bpmndi:BPMNEdge", { id: "Exchange_message_di", bpmnElement: flow, waypoint: [m.moddle.create("dc:Point", { x: 100, y: 30 }), m.moddle.create("dc:Point", { x: 200, y: 30 })] })] }) }));
  return text(await io.export(m.definitions, "bpmn"));
}

export function splitIo(m, direction, ownerId = "Check_order") {
  const input = direction === "Input", owner = m.elementsById[ownerId];
  const create = (type, attrs) => m.moddle.create(`bpmn:${type}`, attrs);
  const a = create(`Data${direction}`, { id: "Set_item_A" });
  const b = create(`Data${direction}`, { id: "Set_item_B" });
  const membership = `data${direction}Refs`;
  const setA = create(`${direction}Set`, { id: "Set_A", [membership]: [a] });
  const setB = create(`${direction}Set`, { id: "Set_B", [membership]: [b] });
  const otherSet = create(input ? "OutputSet" : "InputSet", { id: "Other_set" });
  owner.ioSpecification = create("InputOutputSpecification", { id: "Split_io", dataInputs: input ? [a, b] : [], dataOutputs: input ? [] : [a, b], inputSets: input ? [setA, setB] : [otherSet], outputSets: input ? [otherSet] : [setA, setB] });
  if (owner.$type === "bpmn:Process") return { owner, a, b, setA, setB, membership };
  // Keep each endpoint live in a projected relation, rather than adding unused declarations.
  const associations = [a, b].map((endpoint, i) => create(`Data${direction}Association`, { id: `Split_link_${i}`, sourceRef: input ? [m.elementsById.Order_form] : [endpoint], targetRef: input ? endpoint : m.elementsById.Shipping_note }));
  const property = input ? "dataInputAssociations" : "dataOutputAssociations";
  const removed = owner[property] ?? [];
  m.definitions.diagrams[0].plane.planeElement = m.definitions.diagrams[0].plane.planeElement.filter((di) => !removed.includes(di.bpmnElement));
  owner[property] = associations;
  if (input) {
    owner.properties = [];
    delete m.elementsById.Order_form.extensionElements.values[0].primaryAssociationRef;
  } else delete m.elementsById.Shipping_note.extensionElements.values[0].primaryAssociationRef;
  for (const [i, association] of associations.entries()) m.definitions.diagrams[0].plane.planeElement.push(m.moddle.create("bpmndi:BPMNEdge", { id: `${association.id}_di`, bpmnElement: association, waypoint: [m.moddle.create("dc:Point", { x: 250, y: 200 + i }), m.moddle.create("dc:Point", { x: 300, y: 100 + i })] }));
  return { owner, a, b, setA, setB, membership };
}

export const namespaceCases = [
  ["shadowed prefix", fixture("C1").replace('xmlns:sem=', `xmlns:future="${descriptor.uri.replace(/1$/, "2")}" xmlns:sem=`).replace('<sem:info order="0"', `<future:info xmlns:future="${descriptor.uri}" order="0"`)],
  ["commented unknown element", fixture("C1").replace('xmlns:sem=', `xmlns:future="${descriptor.uri.replace(/1$/, "2")}" xmlns:sem=`).replace('<bpmn:process ', '<!-- <future:info order="0"/> -->\n  <bpmn:process ')],
  ["commented namespace declaration", fixture("C1").replace('<bpmn:process ', `<!-- xmlns:sem="${descriptor.uri.replace(/1$/, "2")}" <sem:info order="0"/> -->\n  <bpmn:process `)],
];
