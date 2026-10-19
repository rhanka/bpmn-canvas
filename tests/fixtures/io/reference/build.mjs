// Builds the invented reference fixtures: for each case of cases.mjs, `diagram.bpmn` shaped like the engine's BPMN
// (one collaboration + process per page, lanes, data objects, ioSpecification, [Reference]/[Component] annotations, DI planes in
// the engine's order) and `process.json` (the normalised ProcessList, keys sorted, as the engine saves it).
// Geometry comes from this library's own layout port. Run after `npm run build`: node tests/fixtures/io/reference/build.mjs
// The expected export bytes are not written here.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BpmnModdle } from "bpmn-moddle";
import { layoutProcess } from "../../../../dist/internal/swimlaneLayout.js";
import { normalize } from "../../../../dist/internal/processModel.js";
import * as CASES from "./cases.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const APP_LINK = 6;
const FLOW = new Set(["START", "END", "TASK", "SUB-PROCESS", "GATEWAY", "EVENT", "EXTERNAL_PROCESS"]);
const ACTIVITY = new Set(["TASK", "SUB-PROCESS", "EXTERNAL_PROCESS", "START", "END", "EVENT", "GATEWAY"]);
const T = (node) => (node.type || "TASK").trim().toUpperCase();

/** json.dumps(value, sort_keys=True) with the default separators and ensure_ascii. */
function pyJson(v) {
  if (v === null || v === undefined) return "null";
  if (v === true) return "true";
  if (v === false) return "false";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "string") return JSON.stringify(v).replace(/[\u007f-￿]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
  if (Array.isArray(v)) return `[${v.map(pyJson).join(", ")}]`;
  return `{${Object.keys(v).sort().map((k) => `${pyJson(k)}: ${pyJson(v[k])}`).join(", ")}}`;
}

function idMaker() {
  const used = new Set();
  return (text, prefix) => {
    let base = String(text || "").replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || prefix;
    if (/^[0-9]/.test(base)) base = `${prefix}_${base}`;
    let cand = base;
    for (let i = 2; used.has(cand); i++) cand = `${base}_${i}`;
    used.add(cand);
    return cand;
  };
}

async function buildOne(m, ids, proc, idx) {
  const name = proc.name || `Process ${idx + 1}`;
  normalize(proc);
  const lay = await layoutProcess(proc);
  const el = new Map();
  const type = new Map();
  const flowElements = [];
  const artifacts = [];
  const lanesSem = [];
  const dataInputs = [];
  const dataOutputs = [];
  for (const lane of proc.lanes) {
    const members = [];
    for (const node of lane.nodes) {
      const label = node.label;
      if (el.has(label)) continue;
      const t = T(node);
      type.set(label, t);
      let e;
      if (t === "TASK_INPUT" || t === "TASK_OUTPUT" || t === "DATA_OBJECT") {
        const obj = m.create("bpmn:DataObject", { id: ids(label + "_obj", "DataObject") });
        e = m.create("bpmn:DataObjectReference", { id: ids(label, "Data"), name: label, dataObjectRef: obj });
        flowElements.push(obj, e);
      } else if (t === "EXTERNAL_INPUT") {
        e = m.create("bpmn:DataInput", { id: ids(label, "DataInput"), name: label });
        dataInputs.push(e);
      } else if (t === "PROCESS_OUTPUT") {
        e = m.create("bpmn:DataOutput", { id: ids(label, "DataOutput"), name: label });
        dataOutputs.push(e);
      } else if (t === "DOCUMENT") {
        e = m.create("bpmn:TextAnnotation", { id: ids("Doc_" + label, "Doc"), text: `[Reference] ${label}` });
        artifacts.push(e);
      } else {
        const tag = { START: "bpmn:StartEvent", END: "bpmn:EndEvent", "SUB-PROCESS": "bpmn:SubProcess", EXTERNAL_PROCESS: "bpmn:CallActivity", EVENT: "bpmn:IntermediateThrowEvent" }[t]
          ?? (t === "GATEWAY" ? ((node.subtype || "").toUpperCase() === "AND" ? "bpmn:ParallelGateway" : "bpmn:ExclusiveGateway") : "bpmn:Task");
        e = m.create(tag, { id: ids(label, "Node"), name: label });
        flowElements.push(e);
        members.push(e);
      }
      el.set(label, e);
    }
    lanesSem.push(m.create("bpmn:Lane", { id: ids(lane.name || "Lane", "Lane"), name: lane.name || "", flowNodeRef: members }));
  }
  const connSem = [];
  for (const c of lay.connections) {
    const src = el.get(c.source), tgt = el.get(c.target);
    const kind = (c.kind || "FLOW").toUpperCase();
    let e = null;
    if (kind === "FLOW") {
      e = m.create("bpmn:SequenceFlow", { id: ids(`Flow_${c.source}_${c.target}`, "Flow"), sourceRef: src, targetRef: tgt });
      if (c.label) e.name = c.label;
      src.get("outgoing").push(e);
      tgt.get("incoming").push(e);
      flowElements.push(e);
    } else if (kind === "DOC") {
      const [act, doc] = type.get(c.target) === "DOCUMENT" ? [src, tgt] : [tgt, src];
      e = m.create("bpmn:Association", { id: ids(`DocLink_${c.source}_${c.target}`, "DocLink"), sourceRef: act, targetRef: doc, associationDirection: "One" });
      artifacts.push(e);
    } else if (ACTIVITY.has(type.get(c.target))) {
      const ph = m.create("bpmn:Property", { id: ids(`${c.target}_in_${c.source}`, "Prop"), name: "__targetRef_placeholder" });
      tgt.get("properties").push(ph);
      e = m.create("bpmn:DataInputAssociation", { id: ids(`In_${c.source}_${c.target}`, "DataIn"), sourceRef: [src], targetRef: ph });
      tgt.get("dataInputAssociations").push(e);
    } else {
      e = m.create("bpmn:DataOutputAssociation", { id: ids(`Out_${c.source}_${c.target}`, "DataOut"), targetRef: tgt });
      src.get("dataOutputAssociations").push(e);
    }
    connSem.push(e);
  }
  const appSem = new Map();
  for (const label of Object.keys(lay.apps)) {
    const node = proc.lanes.flatMap((l) => l.nodes).find((x) => x.label === label);
    const ann = m.create("bpmn:TextAnnotation", { id: ids(`App_${label}`, "App"), text: `[Component] ${node.app_label}` });
    const assoc = m.create("bpmn:Association", { id: ids(`AppLink_${label}`, "Assoc"), sourceRef: ann, targetRef: el.get(label) });
    artifacts.push(ann, assoc);
    appSem.set(label, [ann, assoc]);
  }
  const props = {
    id: ids(name, "Process"), name, isExecutable: false,
    laneSets: [m.create("bpmn:LaneSet", { id: ids(name + "_lanes", "LaneSet"), lanes: lanesSem })],
    flowElements, artifacts,
  };
  if (dataInputs.length || dataOutputs.length) {
    props.ioSpecification = m.create("bpmn:InputOutputSpecification", {
      id: ids(name + "_io", "IO"), dataInputs, dataOutputs,
      inputSets: [m.create("bpmn:InputSet", { id: ids(name + "_inset", "InSet"), dataInputRefs: dataInputs })],
      outputSets: [m.create("bpmn:OutputSet", { id: ids(name + "_outset", "OutSet"), dataOutputRefs: dataOutputs })],
    });
  }
  const process = m.create("bpmn:Process", props);
  const participant = m.create("bpmn:Participant", { id: ids(name + "_pool", "Pool"), name, processRef: process });
  const collab = m.create("bpmn:Collaboration", { id: ids(name + "_collab", "Collab"), participants: [participant] });
  const bounds = (b) => m.create("dc:Bounds", { x: b.x, y: b.y, width: b.w, height: b.h });
  const shape = (e, b, horizontal, label) => {
    const s = m.create("bpmndi:BPMNShape", { id: ids(e.id + "_di", "Shape"), bpmnElement: e, bounds: bounds(b) });
    if (horizontal) s.isHorizontal = true;
    if (label) s.label = m.create("bpmndi:BPMNLabel", { bounds: bounds(label) });
    return s;
  };
  const edge = (e, pts, lb) => {
    const d = m.create("bpmndi:BPMNEdge", { id: ids(e.id + "_di", "Edge"), bpmnElement: e, waypoint: pts.map(([x, y]) => m.create("dc:Point", { x, y })) });
    if (lb) d.label = m.create("bpmndi:BPMNLabel", { bounds: bounds(lb) });
    return d;
  };
  const plane = [shape(participant, lay.pool, true)];
  lanesSem.forEach((sem, i) => plane.push(shape(sem, lay.lanes[i][1], true)));
  for (const [label, e] of el) if (lay.nodes[label]) plane.push(shape(e, lay.nodes[label], false, lay.labels[label]));
  connSem.forEach((e, i) => { if (e && lay.edges[i]?.length) plane.push(edge(e, lay.edges[i], lay.edgeLabels[i])); });
  for (const [label, [ann, assoc]] of appSem) {
    const ab = lay.apps[label], tb = lay.nodes[label];
    plane.push(shape(ann, ab));
    plane.push(edge(assoc, [[ab.x + ab.w / 2, ab.y], [ab.x + ab.w / 2, tb.y + tb.h - APP_LINK]]));
  }
  const diagram = m.create("bpmndi:BPMNDiagram", {
    id: ids(name + "_diagram", "Diagram"), name,
    plane: m.create("bpmndi:BPMNPlane", { id: ids(name + "_plane", "Plane"), bpmnElement: collab, planeElement: plane }),
  });
  return { roots: [collab, process], diagram };
}

async function build(list) {
  const m = new BpmnModdle();
  const ids = idMaker();
  const roots = [];
  const diagrams = [];
  const data = structuredClone(list);
  for (const [i, proc] of data.processes.entries()) {
    const r = await buildOne(m, ids, proc, i);
    roots.push(...r.roots);
    diagrams.push(r.diagram);
  }
  const defs = m.create("bpmn:Definitions", { id: "Definitions_1", targetNamespace: "http://bpmn.io/schema/bpmn", exporter: "test-builder", rootElements: roots, diagrams });
  const { xml } = await m.toXML(defs, { format: true });
  return { xml, json: pyJson(data) };
}

function write(name, xml, json) {
  const dir = join(here, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "diagram.bpmn"), xml);
  writeFileSync(join(dir, "process.json"), json);
}

/** Moves the DI shapes of the given elements, in this order, to just after the shape of `after`. */
function reorderShapes(xml, after, ids) {
  const shapeOf = (id) => {
    const re = new RegExp(`\\n\\s*<bpmndi:BPMNShape id="[^"]*" bpmnElement="${id}"[\\s\\S]*?</bpmndi:BPMNShape>`);
    const m = re.exec(xml);
    if (!m) throw new Error(`no shape for ${id}`);
    return m[0];
  };
  const moved = ids.map(shapeOf);
  for (const s of moved) xml = xml.replace(s, "");
  const anchor = shapeOf(after);
  return xml.replace(anchor, anchor + moved.join(""));
}

const built = {};
for (const name of ["C1", "C2", "C3", "C4", "C6", "C7"]) built[name] = await build(CASES[name]);
write("C1", built.C1.xml, built.C1.json);
write("C2", built.C2.xml, built.C2.json);
write("C3", built.C3.xml, built.C3.json);
write("C4", built.C4.xml, built.C4.json);
// C5: C1 after an edit that gave two tasks the same name (ids unchanged, facts keyed by id still apply).
write("C5", built.C1.xml.replace('name="Ship order"', 'name="Process order"').replace('name="Request details"', 'name="Process order"'), built.C1.json);
// C6: non-integer DI values, with ties at the 4th decimal on the task and the input item.
{
  let xml = built.C6.xml;
  const task = /(<bpmndi:BPMNShape id="[^"]*" bpmnElement="Cost_10_20"[^>]*>\s*<dc:Bounds x=")(\d+)(" y=")(\d+)(" width=")(\d+)/;
  if (!task.test(xml)) throw new Error("C6 task shape not found");
  xml = xml.replace(task, (_, a, x, b, y, c, w) => `${a}${Number(x) + 0.0625}${b}${Number(y) + 0.1875}${c}${Number(w) + 0.5}`);
  const item = /(<bpmndi:BPMNShape id="[^"]*" bpmnElement="Note_v2"[^>]*>\s*<dc:Bounds x=")(\d+)/;
  if (!item.test(xml)) throw new Error("C6 item shape not found");
  xml = xml.replace(item, (_, a, x) => `${a}${Number(x) + 0.3125}`);
  write("C6", xml, built.C6.json);
}
// C7: DI order of the attached artifacts permuted (documents, inputs and outputs no longer in ProcessList order).
write("C7", reorderShapes(built.C7.xml, "Assemble", ["Out_two", "Doc_Doc_three", "In_two", "Doc_Doc_one", "Out_one", "In_one", "Doc_Doc_two"]), built.C7.json);
// R1: the rendering case of the UI tests.
{
  const r1 = await build(CASES.R1);
  mkdirSync(join(here, "../../ui"), { recursive: true });
  writeFileSync(join(here, "../../ui/R1.bpmn"), r1.xml);
}
console.log("fixtures written:", Object.keys(built).concat("C5").sort().join(", "));
