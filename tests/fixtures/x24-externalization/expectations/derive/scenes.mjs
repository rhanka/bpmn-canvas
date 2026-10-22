// x24 derivation helper: synthetic scenes shared by the input generator (derive/inputs.mjs) and the case
// author (derive/author-cases.mjs), so every generated input and every expectation read the same data.
// Pure data; no business literal of the base tree appears here (markers are those of the synthetic data sets).

/** Role prefixes of the three synthetic data sets (policy/*.json), repeated here as scene text. */
export const MARK = {
  L: { document: "[Binder]", application: "[Gadget]" },
  A: { document: "[Folio]", application: "[Aid]" },
  B: { document: "[Leaf]", application: "[Note]" },
};

/** Layout input scene: one process, one lane, annotations of every data set attached to the task. */
export const LAYOUT_INPUT = {
  process: { id: "P1", name: "Intake" },
  lane: { id: "L1", name: "Desk" },
  annotations: [
    { id: "N1", text: `${MARK.L.document} Guide` },
    { id: "N2", text: `${MARK.L.application} ledger` },
    { id: "N3", text: `${MARK.A.application} planner` },
    { id: "N4", text: `${MARK.A.document} Manual` },
    { id: "N5", text: `${MARK.B.application} tracker` },
    { id: "N6", text: `${MARK.B.document} Handbook` },
    { id: "N7", text: "plain remark" },
  ],
};

/** Non-activity host scene (R-001): a document annotation linked to a gateway. */
export const NONACTIVITY = { annotation: { id: "N1", text: `${MARK.L.document} Gate note` } };

/** Facts descriptor of each data set: namespace, prefix and the property names of exportFacts.properties. */
export const FACTS_NS = {
  L: { prefix: "xf", uri: "urn:x24:facts:1", type: "Facts", names: { order: "seq", direction: "way", label: "caption", lane: "lane", primary: "anchor", process: "opens" } },
  A: { prefix: "xf", uri: "urn:x24:facts:1", type: "Facts", names: { order: "seq", direction: "way", label: "caption", lane: "lane", primary: "anchor", process: "opens" } },
  B: { prefix: "yf", uri: "urn:x24:facts-b:1", type: "Facts", names: { order: "pos", direction: "dir", label: "tag", lane: "row", primary: "lead", process: "goes" } },
};
/** Facts element of data set k with neutral fields mapped to its property names. */
export const facts = (k, fields) => ({ prefix: FACTS_NS[k].prefix, uri: FACTS_NS[k].uri, type: FACTS_NS[k].type, props: Object.fromEntries(Object.entries(fields).map(([f, v]) => [FACTS_NS[k].names[f], v])) });

const centreLine = (p, q) => [[p.x + p.w, p.y + Math.floor(p.h / 2)], [q.x, q.y + Math.floor(q.h / 2)]];
/**
 * Reference export scene of data set k (generic scene format, written to BPMN by derive/inputs.mjs and read
 * by arith.referencePages): one pool and lane with a start, a task with a document, an application and an
 * input object, an exclusive gateway with a label, a collapsed sub-process, a call activity, an
 * intermediate event and an end.
 */
export function exportScene(k) {
  const doc = { L: "Guide", A: "Manual", B: "Handbook" }[k];
  const app = { L: "ledger", A: "planner", B: "tracker" }[k];
  const b = {
    S1: { x: 80, y: 120, w: 36, h: 36 }, T1: { x: 160, y: 98, w: 100, h: 80 }, G1: { x: 300, y: 113, w: 50, h: 50 },
    SP1: { x: 390, y: 98, w: 100, h: 80 }, C1: { x: 530, y: 98, w: 100, h: 80 }, EV1: { x: 670, y: 120, w: 36, h: 36 },
    E1: { x: 750, y: 120, w: 36, h: 36 }, D1: { x: 120, y: 200, w: 36, h: 50 }, N1: { x: 150, y: 10, w: 110, h: 50 }, N2: { x: 170, y: 168, w: 80, h: 30 },
  };
  const flow = (id, source, target, name) => ({ id, type: "bpmn:SequenceFlow", source, target, ...(name ? { name } : {}), points: centreLine(b[source], b[target]) });
  return {
    namespaces: { [FACTS_NS[k].prefix]: FACTS_NS[k].uri },
    collaboration: { id: "C1", participant: { id: "Pool1", name: "Intake", processRef: "P1", box: { x: 0, y: 0, w: 820, h: 270 } } },
    processes: [{
      id: "P1",
      lanes: [{ id: "L1", name: "Desk", box: { x: 30, y: 0, w: 790, h: 270 }, members: ["S1", "T1", "G1", "SP1", "C1", "EV1", "E1"] }],
      flowElements: [
        { id: "S1", type: "bpmn:StartEvent", name: "In", box: b.S1 },
        { id: "T1", type: "bpmn:Task", name: "Review", box: b.T1, properties: [{ id: "T1_input", name: "input" }], dataInputAssociations: [{ id: "DIA1", type: "bpmn:DataInputAssociation", source: "D1", target: "T1_input", points: [[138, 200], [180, 178]] }] },
        { id: "G1", type: "bpmn:ExclusiveGateway", name: "Done?", box: b.G1, labelBox: { x: 290, y: 166, w: 70, h: 14 } },
        { id: "SP1", type: "bpmn:SubProcess", name: "Check", box: b.SP1, collapsed: true },
        { id: "C1", type: "bpmn:CallActivity", name: "Escalate", box: b.C1 },
        { id: "EV1", type: "bpmn:IntermediateThrowEvent", name: "Notify", box: b.EV1 },
        { id: "E1", type: "bpmn:EndEvent", name: "Out", box: b.E1 },
        { id: "D1", type: "bpmn:DataObjectReference", name: "Form", box: b.D1, dataObjectRef: "DO1", facts: facts(k, { lane: "L1", direction: "in" }) },
        { id: "DO1", type: "bpmn:DataObject" },
        flow("F1", "S1", "T1"), flow("F2", "T1", "G1"), flow("F3", "G1", "SP1", "yes"), flow("F4", "SP1", "C1"), flow("F5", "C1", "EV1"), flow("F6", "EV1", "E1"),
        { id: "F7", type: "bpmn:SequenceFlow", source: "G1", target: "E1", name: "no", points: [[325, 163], [325, 230], [768, 230], [768, 156]] },
      ],
      artifacts: [
        { id: "N1", type: "bpmn:TextAnnotation", text: `${MARK[k].document} ${doc}`, box: b.N1, facts: facts(k, { lane: "L1" }) },
        { id: "N2", type: "bpmn:TextAnnotation", text: `${MARK[k].application} ${app}`, box: b.N2, facts: facts(k, { lane: "L1" }) },
        { id: "A1", type: "bpmn:Association", source: "N1", target: "T1", points: [[205, 60], [205, 98]] },
        { id: "A2", type: "bpmn:Association", source: "N2", target: "T1" },
      ],
    }],
  };
}

/**
 * Facts export scene (data set L and A facts): no annotation; a facts order on the first task, a navigation
 * process, a labelled data association, a primary association choosing the second reader, a direction on
 * an unlinked output object, and a second process drawn on its own page.
 */
export function factsScene(k = "A") {
  const b = {
    S1: { x: 80, y: 110, w: 36, h: 36 }, T1: { x: 160, y: 88, w: 100, h: 80 }, T2: { x: 300, y: 88, w: 100, h: 80 }, E1: { x: 440, y: 110, w: 36, h: 36 },
    D1: { x: 220, y: 200, w: 36, h: 50 }, D2: { x: 520, y: 200, w: 36, h: 50 }, S2: { x: 80, y: 400, w: 36, h: 36 }, E2: { x: 200, y: 400, w: 36, h: 36 },
  };
  const flow = (id, source, target) => ({ id, type: "bpmn:SequenceFlow", source, target, points: centreLine(b[source], b[target]) });
  return {
    namespaces: { [FACTS_NS[k].prefix]: FACTS_NS[k].uri },
    collaboration: { id: "C1", participant: { id: "Pool1", name: "Ledger", processRef: "P1", box: { x: 0, y: 0, w: 600, h: 280 } } },
    processes: [
      {
        id: "P1",
        lanes: [{ id: "L1", name: "Desk", box: { x: 30, y: 0, w: 570, h: 280 }, members: ["S1", "T1", "T2", "E1"] }],
        flowElements: [
          { id: "S1", type: "bpmn:StartEvent", name: "In", box: b.S1 },
          { id: "T1", type: "bpmn:Task", name: "Review", box: b.T1, facts: facts(k, { order: 3, process: "P2" }), properties: [{ id: "T1_input", name: "input" }], dataInputAssociations: [{ id: "DIA1", type: "bpmn:DataInputAssociation", source: "D1", target: "T1_input", points: [[238, 200], [210, 168]], facts: facts(k, { label: "reads" }) }] },
          { id: "T2", type: "bpmn:Task", name: "Approve", box: b.T2, properties: [{ id: "T2_input", name: "input" }], dataInputAssociations: [{ id: "DIA2", type: "bpmn:DataInputAssociation", source: "D1", target: "T2_input", points: [[256, 225], [350, 168]] }] },
          { id: "E1", type: "bpmn:EndEvent", name: "Out", box: b.E1 },
          { id: "D1", type: "bpmn:DataObjectReference", name: "Form", box: b.D1, dataObjectRef: "DO1", facts: facts(k, { lane: "L1", direction: "in", primary: "DIA2" }) },
          { id: "D2", type: "bpmn:DataObjectReference", name: "Archive", box: b.D2, dataObjectRef: "DO2", facts: facts(k, { lane: "L1", direction: "out" }) },
          { id: "DO1", type: "bpmn:DataObject" },
          { id: "DO2", type: "bpmn:DataObject" },
          flow("F1", "S1", "T1"), flow("F2", "T1", "T2"), flow("F3", "T2", "E1"),
        ],
        artifacts: [],
      },
      {
        id: "P2",
        name: "Sub ledger",
        lanes: [],
        flowElements: [
          { id: "S2", type: "bpmn:StartEvent", name: "Begin", box: b.S2 },
          { id: "E2", type: "bpmn:EndEvent", name: "Finish", box: b.E2 },
          flow("F4", "S2", "E2"),
        ],
        artifacts: [],
      },
    ],
  };
}

/** Facts of another version of the injected facts namespace family (refused before any page is read). */
export function factsVersionScene(k) {
  const v2 = { ...facts(k, { order: 1 }), uri: FACTS_NS[k].uri.replace(/1$/, "2") };
  return {
    namespaces: { [FACTS_NS[k].prefix]: v2.uri },
    collaboration: { id: "C1", participant: { id: "Pool1", name: "Intake", processRef: "P1", box: { x: 0, y: 0, w: 400, h: 200 } } },
    processes: [{
      id: "P1",
      lanes: [{ id: "L1", name: "Desk", box: { x: 30, y: 0, w: 370, h: 200 }, members: ["S1", "T1"] }],
      flowElements: [
        { id: "S1", type: "bpmn:StartEvent", name: "In", box: { x: 80, y: 82, w: 36, h: 36 } },
        { id: "T1", type: "bpmn:Task", name: "Review", box: { x: 160, y: 60, w: 100, h: 80 }, facts: v2 },
        { id: "F1", type: "bpmn:SequenceFlow", source: "S1", target: "T1", points: [[116, 100], [160, 100]] },
      ],
      artifacts: [],
    }],
  };
}

/**
 * Surface scene (static render, preview, workshop): one pool and lane with a task, a collapsed
 * sub-process, a call activity and a gateway, and annotations of every data set. Bounds are absolute.
 */
export const SURFACE = {
  pool: { id: "Pool1", name: "Intake", box: { x: 0, y: 0, w: 900, h: 400 } },
  lane: { id: "L1", name: "Desk", box: { x: 30, y: 0, w: 870, h: 400 } },
  nodes: [
    { id: "S1", type: "bpmn:StartEvent", name: "In", box: { x: 80, y: 182, w: 36, h: 36 } },
    { id: "T1", type: "bpmn:Task", name: "Review", box: { x: 180, y: 160, w: 120, h: 80 } },
    { id: "SP1", type: "bpmn:SubProcess", name: "Check", box: { x: 360, y: 160, w: 120, h: 80 } },
    { id: "C1", type: "bpmn:CallActivity", name: "Escalate", box: { x: 540, y: 160, w: 120, h: 80 } },
    { id: "G1", type: "bpmn:ExclusiveGateway", name: "Done?", box: { x: 720, y: 175, w: 50, h: 50 } },
    { id: "U1", type: "bpmn:UserTask", name: "Confirm", box: { x: 760, y: 280, w: 120, h: 80 } },
    { id: "E1", type: "bpmn:EndEvent", name: "Out", box: { x: 820, y: 182, w: 36, h: 36 } },
  ],
  annotations: [
    { id: "N1", text: `${MARK.L.document} Guide`, box: { x: 60, y: 20, w: 110, h: 50 }, host: "T1" },
    { id: "N2", text: `${MARK.L.application} ledger`, box: { x: 60, y: 320, w: 90, h: 30 }, host: "T1" },
    { id: "N3", text: `${MARK.A.application} planner`, box: { x: 170, y: 320, w: 90, h: 30 }, host: "T1" },
    { id: "N4", text: `${MARK.A.document} Manual`, box: { x: 200, y: 20, w: 100, h: 48 }, host: "T1" },
    { id: "N5", text: `${MARK.B.application} tracker`, box: { x: 280, y: 320, w: 90, h: 30 }, host: "T1" },
    { id: "N6", text: `${MARK.B.document} Handbook`, box: { x: 360, y: 20, w: 106, h: 44 }, host: "SP1" },
    { id: "N7", text: `${MARK.A.application} gate`, box: { x: 700, y: 320, w: 90, h: 30 }, host: "G1" },
    { id: "N8", text: `${MARK.B.application} sub`, box: { x: 390, y: 320, w: 90, h: 30 }, host: "SP1" },
    { id: "N9", text: `${MARK.L.application} call`, box: { x: 560, y: 230, w: 80, h: 28 }, host: "C1" },
    { id: "N10", text: "plain remark", box: { x: 600, y: 20, w: 100, h: 40 }, host: "T1" },
    { id: "N11", text: `${MARK.A.application} user`, box: { x: 600, y: 370, w: 90, h: 30 }, host: "U1" },
    { id: "N12", text: `${MARK.B.application} user`, box: { x: 790, y: 350, w: 80, h: 26 }, host: "U1" },
  ],
  flows: [["F1", "S1", "T1"], ["F2", "T1", "SP1"], ["F3", "SP1", "C1"], ["F4", "C1", "G1"], ["F5", "G1", "E1"], ["F6", "G1", "U1"]],
};

/**
 * Neutral layout model of the full-layout case (x24.layout.process): two lanes; the first carries a start,
 * a task with an application label, a document, an input and an output object, a gateway and an end; the
 * second a call activity, a sub-process with an application label, a loose port and an end.
 */
export const LAYOUT_PROCESS = {
  name: "Intake",
  lanes: [
    { name: "Desk", nodes: [
      { kind: "start", id: "S1", text: "Received" },
      { kind: "task", id: "T1", text: "Review the request", application: "Registry" },
      { kind: "gateway", id: "G1", text: "Complete?", subtype: "OR" },
      { kind: "end", id: "E1", text: "Done" },
      { kind: "document", id: "D1", text: "Checklist", attachedTo: "T1", direction: "document" },
      { kind: "object-in", id: "I1", text: "Form", attachedTo: "T1", direction: "in" },
      { kind: "object-out", id: "O1", text: "Form with the signed decision of the partner", attachedTo: "T1", direction: "out" },
    ] },
    { name: "Back office", nodes: [
      { kind: "call", id: "C1", text: "Ask the partner" },
      { kind: "subprocess", id: "SP1", text: "Archive", application: "Vault" },
      { kind: "port-in", id: "P1", text: "Inbox of the regional office for every open question" },
      { kind: "end", id: "E2", text: "Closed after the regional office answered every open question" },
    ] },
    { name: "Archive", nodes: [
      { kind: "event", id: "EV1", text: "Wait" },
    ] },
  ],
  connections: [
    { source: "I1", target: "T1", kind: "data" },
    { source: "T1", target: "O1", kind: "data" },
    { source: "S1", target: "T1", kind: "sequence" },
    { source: "T1", target: "G1", kind: "sequence" },
    { source: "G1", target: "E1", kind: "sequence", label: "yes" },
    { source: "G1", target: "C1", kind: "sequence", label: "no" },
    { source: "C1", target: "SP1", kind: "sequence" },
    { source: "SP1", target: "E2", kind: "sequence" },
    { source: "D1", target: "T1", kind: "document" },
  ],
};

/** Draw.io decoding scenes: one page, one pool and lane, a task and data-set specific symbols. */
export const DECODE = {
  L: [
    { id: "tool", value: "ledger", style: "shape=x24.legacy.symbol;symbolType=tool;", parent: "task", box: { x: 10, y: 70, w: 80, h: 30 } },
    { id: "sheet", value: "Guide", style: "shape=x24.legacy.sheet;", parent: "lane", box: { x: 160, y: 10, w: 110, h: 50 } },
    { id: "proc", value: "Partner", style: "shape=x24.legacy.symbol;symbolType=call;", parent: "lane", box: { x: 330, y: 78, w: 100, h: 80 } },
  ],
  A: [
    { id: "sheet", value: "Manual", style: "shape=mxgraph.flowchart.document;", parent: "lane", box: { x: 160, y: 10, w: 110, h: 50 } },
    { id: "card", value: "planner", style: "shape=mxgraph.flowchart.card;", parent: "task", box: { x: 10, y: 70, w: 80, h: 30 } },
  ],
  B: [
    { id: "leaf", value: "Handbook", style: "shape=x24.leaf;", parent: "lane", box: { x: 160, y: 10, w: 110, h: 50 } },
    { id: "note", value: "tracker", style: "shape=x24.note;", parent: "task", box: { x: 10, y: 70, w: 80, h: 30 } },
  ],
};
