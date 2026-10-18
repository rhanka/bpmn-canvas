import { model, outputs, replaceType } from "./semantic.mjs";
import { splitIo } from "./review-3.mjs";

// Containers consumed by the Rev-3 projection, including endpoint and IO scaffolding.
// Child candidates come from moddle inheritance, never an implementation whitelist.
const containers = {
  Definitions: (m) => m.definitions,
  Collaboration: (m) => m.elementsById.Order_handling_collab,
  Participant: (m) => m.elementsById.Order_handling_pool,
  Process: (m) => m.elementsById.Order_handling,
  LaneSet: (m) => m.elementsById.Order_handling_lanes,
  Lane: (m) => m.elementsById.Sales,
  Task: (m) => m.elementsById.Check_order,
  SubProcess: (m) => replaceType(m, "Check_order", "bpmn:SubProcess"),
  CallActivity: (m) => replaceType(m, "Check_order", "bpmn:CallActivity"),
  StartEvent: (m) => m.elementsById.Order_received,
  EndEvent: (m) => m.elementsById.Order_shipped,
  IntermediateThrowEvent: (m) => replaceType(m, "Order_received", "bpmn:IntermediateThrowEvent"),
  ExclusiveGateway: (m) => m.elementsById.Order_complete,
  ParallelGateway: (m) => replaceType(m, "Order_complete", "bpmn:ParallelGateway"),
  DataObject: (m) => m.elementsById.Order_form_obj,
  DataObjectReference: (m) => m.elementsById.Order_form,
  TextAnnotation: (m) => m.elementsById.Doc_Shipping_policy,
  SequenceFlow: (m) => m.elementsById.Flow_Order_received_Check_order,
  Association: (m) => m.elementsById.DocLink_Shipping_policy_Ship_order,
  DataInputAssociation: (m) => m.elementsById.In_Order_form_Check_order,
  DataOutputAssociation: (m) => m.elementsById.Out_Ship_order_Shipping_note,
  Property: (m) => m.elementsById.In_Order_form_Check_order_target,
  InputOutputSpecification: (m) => splitIo(m, "Input").owner.ioSpecification,
  InputSet: (m) => splitIo(m, "Input").setA,
  OutputSet: (m) => splitIo(m, "Output").setA,
  DataInput: (m) => splitIo(m, "Input").a,
  DataOutput: (m) => splitIo(m, "Output").a,
  ExtensionElements: (m) => m.elementsById.Order_received.extensionElements,
  "sem:Info": (m) => m.elementsById.Order_received.extensionElements.values[0],
};

// DESIGN Rev 3, D4's projection table: standard page artifacts, the codec's
// flow vocabulary, flat lanes and activity-owned DATA relations are supported.
// This oracle describes the injected structure, independently of export results.
// Other injections are outside that vocabulary, nested content, unused
// declarations, duplicate metadata or IO scaffolding without required membership.
const supportedPlacements = {
  "Collaboration.artifacts": ["TextAnnotation", "Association"],
  "Process.flowElements": ["StartEvent", "EndEvent", "IntermediateThrowEvent", "Task", "SubProcess", "CallActivity", "ExclusiveGateway", "ParallelGateway", "DataObjectReference", "SequenceFlow"],
  "Process.artifacts": ["TextAnnotation", "Association"],
  "LaneSet.lanes": ["Lane"],
  ...Object.fromEntries(["Task", "SubProcess", "CallActivity"].flatMap((owner) => [
    [`${owner}.dataInputAssociations`, ["DataInputAssociation"]],
    [`${owner}.dataOutputAssociations`, ["DataOutputAssociation"]],
  ])),
};

export function expectedContainment(c) {
  return supportedPlacements[`${c.container}.${c.property}`]?.some((type) => c.childType === `bpmn:${type}`)
    ? "supported" : "refused";
}

export async function containmentCases() {
  const m = await model();
  const types = m.moddle.getPackages().filter((p) => ["bpmn", "sem"].includes(p.prefix))
    .flatMap((p) => p.types.filter((t) => !t.isAbstract).map((t) => `${p.prefix}:${t.name}`));
  const result = [];
  for (const container of Object.keys(containers)) {
    const type = container.includes(":") ? container : `bpmn:${container}`;
    for (const property of m.moddle.create(type).$descriptor.properties) {
      if (property.isReference || property.isVirtual || property.isAttr) continue;
      for (const childType of types) {
        const child = m.moddle.create(childType);
        if (property.type === "Element" || child.$instanceOf(property.type)) {
          const c = { container, property: property.name, childType, many: !!property.isMany };
          result.push({ ...c, expected: expectedContainment(c) });
        }
      }
    }
  }
  return result;
}

export async function injectChild(c) {
  const m = await model(), owner = containers[c.container](m);
  const baseline = await outputs(m);
  const child = m.moddle.create(c.childType, { id: "Injected_child" });
  if (child.$descriptor.properties.some((p) => p.name === "name")) child.name = "Injected child";
  // Use valid semantic data wherever a simple drawable/relation can be exported.
  if (c.childType === "bpmn:TextAnnotation") child.text = "[Doc] Injected document";
  if (c.childType === "sem:Info") child.order = 99999;
  if (c.childType === "bpmn:SequenceFlow") {
    child.sourceRef = m.elementsById.Order_received;
    child.targetRef = m.elementsById.Check_order;
    child.sourceRef.outgoing.push(child); child.targetRef.incoming.push(child);
  }
  if (c.childType === "bpmn:Association") { child.sourceRef = m.elementsById.Doc_Shipping_policy; child.targetRef = m.elementsById.Check_order; }
  if (c.childType === "bpmn:DataInputAssociation") { child.sourceRef = [m.elementsById.Order_form]; child.targetRef = m.elementsById.In_Order_form_Check_order_target; }
  if (c.childType === "bpmn:DataOutputAssociation") { child.sourceRef = []; child.targetRef = m.elementsById.Shipping_note; }
  if (c.childType === "bpmn:InputOutputSpecification") {
    child.inputSets = [m.moddle.create("bpmn:InputSet")];
    child.outputSets = [m.moddle.create("bpmn:OutputSet")];
  }
  if (["bpmn:DataObjectReference", "bpmn:DataInput", "bpmn:DataOutput", "bpmn:TextAnnotation"].includes(c.childType)) {
    child.extensionElements = m.moddle.create("bpmn:ExtensionElements", { values: [m.moddle.create("sem:Info", { laneRef: m.elementsById.Sales, ...(c.childType === "bpmn:DataObjectReference" ? { direction: "in" } : {}) })] });
  }
  if (c.many) owner[c.property] = [...(owner[c.property] ?? []), child];
  else owner[c.property] = child;
  // DI is deliberately supplied so successful unchanged bytes expose semantic loss.
  const relation = ["SequenceFlow", "Association", "DataInputAssociation", "DataOutputAssociation"].includes(c.childType.split(":")[1]);
  m.definitions.diagrams[0].plane.planeElement.push(m.moddle.create(relation ? "bpmndi:BPMNEdge" : "bpmndi:BPMNShape", { id: "Injected_di", bpmnElement: child, ...(relation ? { waypoint: [m.moddle.create("dc:Point", { x: 50, y: 50 }), m.moddle.create("dc:Point", { x: 100, y: 100 })] } : { bounds: m.moddle.create("dc:Bounds", { x: 50, y: 50, width: 60, height: 40 }) }) }));
  // Non-drawable scaffolding must be judged by containment, not by an invalid DI shape.
  if (!["StartEvent", "EndEvent", "Task", "SubProcess", "CallActivity", "ExclusiveGateway", "ParallelGateway", "IntermediateThrowEvent", "DataObjectReference", "DataInput", "DataOutput", "TextAnnotation", "Lane", "Participant"].includes(c.childType.split(":")[1]) && !relation) m.definitions.diagrams[0].plane.planeElement.pop();
  return { ...m, child, baseline };
}
