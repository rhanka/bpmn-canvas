// Legend profile: [Doc] link and lane-header tokens, DataInput/DataOutput lifecycle, getShapePath hit outlines.
import Modeler from "bpmn-js/lib/Modeler";
import { legendProfile } from "../../dist/profiles/legend/index.js";

const NS = 'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI"';
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${NS} id="D" targetNamespace="http://example.org/legend3">
  <bpmn:collaboration id="C"><bpmn:participant id="PA" name="Pool" processRef="P"/></bpmn:collaboration>
  <bpmn:process id="P" isExecutable="false">
    <bpmn:laneSet id="LS"><bpmn:lane id="L1" name="Lane"><bpmn:flowNodeRef>T</bpmn:flowNodeRef><bpmn:flowNodeRef>S</bpmn:flowNodeRef><bpmn:flowNodeRef>G</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>
    <bpmn:startEvent id="S" name="Begin"/>
    <bpmn:task id="T" name="Task"><bpmn:dataOutputAssociation id="DA"><bpmn:targetRef>DO</bpmn:targetRef></bpmn:dataOutputAssociation></bpmn:task>
    <bpmn:dataObjectReference id="DO" name="Out"/>
    <bpmn:exclusiveGateway id="G"/>
    <bpmn:textAnnotation id="DOC"><bpmn:text>[Doc] Form</bpmn:text></bpmn:textAnnotation>
    <bpmn:textAnnotation id="NOTE"><bpmn:text>plain note</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="AD" sourceRef="T" targetRef="DOC"/>
    <bpmn:association id="AN" sourceRef="T" targetRef="NOTE"/>
    <bpmn:association id="AO" associationDirection="One" sourceRef="G" targetRef="DOC"/>
    <bpmn:association id="AP" associationDirection="One" sourceRef="G" targetRef="NOTE"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BD"><bpmndi:BPMNPlane id="PL" bpmnElement="C">
    <bpmndi:BPMNShape id="dPA" bpmnElement="PA" isHorizontal="true"><dc:Bounds x="100" y="50" width="800" height="300"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dL1" bpmnElement="L1" isHorizontal="true"><dc:Bounds x="130" y="50" width="770" height="300"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dS" bpmnElement="S"><dc:Bounds x="180" y="122" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="176" y="160" width="44" height="14"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dDO" bpmnElement="DO"><dc:Bounds x="290" y="270" width="36" height="50"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="dDA" bpmnElement="DA"><di:waypoint x="320" y="180"/><di:waypoint x="308" y="270"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNShape id="dT" bpmnElement="T"><dc:Bounds x="260" y="100" width="120" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dG" bpmnElement="G" isMarkerVisible="true"><dc:Bounds x="440" y="115" width="50" height="50"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dDOC" bpmnElement="DOC"><dc:Bounds x="400" y="220" width="120" height="50"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dNOTE" bpmnElement="NOTE"><dc:Bounds x="560" y="220" width="100" height="40"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="dAD" bpmnElement="AD"><di:waypoint x="340" y="180"/><di:waypoint x="400" y="230"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="dAO" bpmnElement="AO"><di:waypoint x="465" y="165"/><di:waypoint x="465" y="220"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="dAP" bpmnElement="AP"><di:waypoint x="490" y="140"/><di:waypoint x="600" y="220"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="dAN" bpmnElement="AN"><di:waypoint x="380" y="150"/><di:waypoint x="560" y="230"/></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

let seq = 0;
async function make(tokens) {
  const profile = legendProfile(tokens);
  const host = document.createElement("div");
  host.style.cssText = "width:1000px;height:420px;position:relative";
  document.body.appendChild(host);
  const m = new Modeler({ container: host, additionalModules: [...profile.modelerModules], bpmnCanvas: { instanceId: `l3-${++seq}`, legend: profile.tokens } });
  const { warnings } = await m.importXML(XML);
  return { host, m, warnings: warnings.map((w) => w.message) };
}
const hex = (v) => {
  const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(String(v).trim());
  return m ? "#" + m.slice(1).map((n) => Number(n).toString(16).padStart(2, "0")).join("") : String(v).trim().toLowerCase();
};
const visual = (host, id) => host.querySelector(`.djs-element[data-element-id="${id}"] .djs-visual`);
const linkOf = (host, id) => {
  const p = visual(host, id)?.querySelector("path.legend-link");
  if (!p) return null;
  const cs = getComputedStyle(p);
  return { stroke: hex(cs.stroke), dash: cs.strokeDasharray.replace(/px/g, "").replace(/,\s*/g, " ") };
};
const dataArrow = (host, id) => {
  const p = visual(host, id)?.querySelector("path.legend-link");
  return p ? getComputedStyle(p).markerEnd !== "none" : null;
};
const labelFill = (host) => {
  const t = host.querySelector('.djs-element[data-element-id="S_label"] text');
  return t ? hex(getComputedStyle(t).fill) : null;
};
const headerFill = (host) => {
  const r = host.querySelector(".legend-lane-header");
  return r ? hex(getComputedStyle(r).fill) : null;
};
const countIo = async (m) => {
  const xml = (await m.saveXML()).xml;
  const n = (name) => (xml.match(new RegExp(`<bpmn:${name}[ />]`, "g")) ?? []).length;
  return { xml, ioSpecification: n("ioSpecification"), dataInput: n("dataInput"), dataOutput: n("dataOutput"), inputSet: n("inputSet"), outputSet: n("outputSet"), dataInputRefs: n("dataInputRefs"), dataOutputRefs: n("dataOutputRefs") };
};

window.runLegend3 = async () => {
  const out = {};

  // (1) [Doc] link and lane header tokens.
  const neutral = await make();
  out.neutral = { directional: { doc: linkOf(neutral.host, "AO"), note: linkOf(neutral.host, "AP") }, doc: linkOf(neutral.host, "AD"), note: linkOf(neutral.host, "AN"), header: headerFill(neutral.host), warnings: neutral.warnings };
  const given = await make({ link: "#112233", docLink: "#b85450", docLinkDash: "3 4", laneFill: "#aabbcc", laneHeaderFill: "#fbf9f6" });
  out.given = { directional: linkOf(given.host, "AO"), doc: linkOf(given.host, "AD"), note: linkOf(given.host, "AN"), header: headerFill(given.host) };
  out.arrow = { neutral: dataArrow(neutral.host, "DA") };
  out.labels = { neutral: labelFill(neutral.host) };
  const plainer = await make({ dataLinkArrow: true, labelText: "#445566" });
  out.arrow.on = dataArrow(plainer.host, "DA");
  out.labels.named = labelFill(plainer.host);
  plainer.m.destroy(); plainer.host.remove();
  const followed = await make({ link: "#112233", laneFill: "#aabbcc" });
  out.followed = { doc: linkOf(followed.host, "AD"), note: linkOf(followed.host, "AN"), header: headerFill(followed.host) };

  // (2) DataInput / DataOutput: create, move, delete, undo, ioSpecification.
  const { m } = given;
  const modeling = m.get("modeling");
  const stack = m.get("commandStack");
  const root = m.get("canvas").getRootElement();
  const reg = m.get("elementRegistry");
  const io = {};
  io.before = await countIo(m);
  const din = modeling.createShape({ type: "bpmn:DataInput" }, { x: 300, y: 300 }, reg.get("PA"));
  const dout = modeling.createShape({ type: "bpmn:DataOutput" }, { x: 380, y: 300 }, reg.get("PA"));
  io.parentOk = [din.businessObject.$parent !== undefined, dout.businessObject.$parent !== undefined];
  io.created = await countIo(m);
  io.createdDrawn = [!!visual(given.host, din.id), !!visual(given.host, dout.id)];
  modeling.moveElements([din], { x: 40, y: 20 }, reg.get("PA"));
  io.moved = { x: din.x, y: din.y };
  io.afterMove = await countIo(m);
  modeling.removeElements([din]);
  io.afterRemoveInput = await countIo(m);
  stack.undo();
  io.afterUndoRemove = await countIo(m);
  stack.undo();
  stack.undo();
  io.afterUndoMove = { x: din.x, y: din.y };
  stack.undo();
  io.afterUndoAll = await countIo(m);
  stack.redo(); stack.redo();
  io.afterRedo = await countIo(m);
  for (const k of Object.keys(io)) if (io[k] && io[k].xml) delete io[k].xml;
  out.io = io;
  out.rootId = root.id;

  // (3) getShapePath hit outlines of the legend renderer.
  const eventBus = m.get("eventBus");
  const pathOf = (id) => eventBus.fire("render.getShapePath", reg.get(id));
  out.paths = { event: pathOf("S"), gateway: pathOf("G"), doc: pathOf("DOC"), task: pathOf("T") };
  out.sizes = Object.fromEntries(["S", "G", "DOC", "T"].map((id) => [id, { w: reg.get(id).width, h: reg.get(id).height }]));

  for (const x of [neutral, given, followed]) { x.m.destroy(); x.host.remove(); }
  return out;
};
window.__ready = true;
