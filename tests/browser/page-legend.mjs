// Replayable smoke of the legend profile in a real browser (originally written by the profile worker).
import Modeler from "bpmn-js/lib/Modeler";
import { legendProfile } from "../../dist/profiles/legend/index.js";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="D" targetNamespace="http://example.org/legend">
  <bpmn:process id="P" isExecutable="false">
    <bpmn:startEvent id="S"/>
    <bpmn:startEvent id="SM"><bpmn:messageEventDefinition id="SMD"/></bpmn:startEvent>
    <bpmn:task id="T1" name="Plain task"/>
    <bpmn:boundaryEvent id="BT" attachedToRef="T1"><bpmn:timerEventDefinition id="BTD"/></bpmn:boundaryEvent>
    <bpmn:exclusiveGateway id="GX"/>
    <bpmn:inclusiveGateway id="GI"/>
    <bpmn:endEvent id="E"/>
    <bpmn:userTask id="UT" name="User task"/>
    <bpmn:textAnnotation id="APP"><bpmn:text>[App] CRM</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="AS" sourceRef="T1" targetRef="APP"/>
    <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="T1"/>
    <bpmn:sequenceFlow id="F2" sourceRef="T1" targetRef="GX"/>
    <bpmn:sequenceFlow id="FC" name="cond" sourceRef="GX" targetRef="GI"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">x</bpmn:conditionExpression></bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="F3" sourceRef="GI" targetRef="E"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BD"><bpmndi:BPMNPlane id="PL" bpmnElement="P">
    <bpmndi:BPMNShape id="dS" bpmnElement="S"><dc:Bounds x="100" y="100" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dSM" bpmnElement="SM"><dc:Bounds x="100" y="300" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dT1" bpmnElement="T1"><dc:Bounds x="200" y="78" width="120" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dBT" bpmnElement="BT"><dc:Bounds x="232" y="140" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dGX" bpmnElement="GX" isMarkerVisible="true"><dc:Bounds x="400" y="93" width="50" height="50"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dGI" bpmnElement="GI"><dc:Bounds x="520" y="93" width="50" height="50"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dE" bpmnElement="E"><dc:Bounds x="640" y="100" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dUT" bpmnElement="UT"><dc:Bounds x="200" y="280" width="100" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dAPP" bpmnElement="APP"><dc:Bounds x="220" y="148" width="80" height="30"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="dAS" bpmnElement="AS"><di:waypoint x="260" y="158"/><di:waypoint x="260" y="148"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="dF1" bpmnElement="F1"><di:waypoint x="136" y="118"/><di:waypoint x="200" y="118"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="dF2" bpmnElement="F2"><di:waypoint x="320" y="118"/><di:waypoint x="400" y="118"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="dFC" bpmnElement="FC"><di:waypoint x="450" y="118"/><di:waypoint x="520" y="118"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="dF3" bpmnElement="F3"><di:waypoint x="570" y="118"/><di:waypoint x="640" y="118"/></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const mount = (id) => {
  const c = document.createElement("div");
  c.id = `host-${id}`;
  c.style.cssText = "width:800px;height:500px;position:relative";
  document.body.appendChild(c);
  return c;
};

const gfxOf = (host, id) => host.querySelector(`.djs-element[data-element-id="${id}"]`);
const info = (host, id) => {
  const g = gfxOf(host, id);
  if (!g) return { present: false };
  const legendClasses = [...g.querySelectorAll('[class*="legend-"]')].map((n) => n.getAttribute("class"));
  return {
    present: true,
    display: g.style.display || getComputedStyle(g).display,
    legend: legendClasses.length > 0,
    shapeClass: !!g.querySelector(".legend-shape"),
    legendClasses: [...new Set(legendClasses)],
    circles: g.querySelectorAll("circle").length,
    rects: g.querySelectorAll("rect").length,
    paths: [...g.querySelectorAll("path")].map((p) => p.getAttribute("d")?.slice(0, 40)),
    xMark: [...g.querySelectorAll("path")].some((p) => (p.getAttribute("d") ?? "").includes("l16 16")),
    plusMark: [...g.querySelectorAll("path")].some((p) => (p.getAttribute("d") ?? "").includes("h20M")),
  };
};

window.runSmoke = async () => {
  const profile = legendProfile();
  const make = async (id, withLegend) => {
    const host = mount(id);
    const options = { container: host };
    if (withLegend) {
      options.additionalModules = [...profile.modelerModules];
      options.bpmnCanvas = { instanceId: id, legend: profile.tokens };
    }
    const m = new Modeler(options);
    const { warnings } = await m.importXML(XML);
    return { host, m, warnings: warnings.map((w) => w.message) };
  };
  const a = await make("ia", true);
  const b = await make("ib", true);
  const plain = await make("plain", false);

  const ids = ["T1", "UT", "GX", "GI", "BT", "S", "SM", "E", "APP", "F1", "FC", "AS"];
  const reportOf = (x) => Object.fromEntries(ids.map((id) => [id, info(x.host, id)]));
  const out = { warnings: { a: a.warnings, b: b.warnings, plain: plain.warnings }, a: reportOf(a), plain: reportOf(plain) };

  // Distinct, prefixed marker / gradient ids, unique over the whole document.
  const defIds = (host) => [...host.querySelectorAll("marker[id], linearGradient[id]")].map((n) => n.id);
  out.defIds = { a: defIds(a.host), b: defIds(b.host), plain: defIds(plain.host) };
  const all = [...document.querySelectorAll("[id]")].map((n) => n.id);
  out.duplicateDocumentIds = all.filter((v, i) => all.indexOf(v) !== i && /legend|marker|gradient/.test(v));

  // Instance-safe updater: create DataInput in A (works), in the plain instance (upstream throws), proto untouched.
  const create = (m) => {
    const modeling = m.get("modeling");
    const root = m.get("canvas").getRootElement();
    return modeling.createShape({ type: "bpmn:DataInput" }, { x: 500, y: 300 }, root);
  };
  const protoBefore = Object.getPrototypeOf(a.m.get("bpmnUpdater")).constructor.name;
  let created = null, createErr = null;
  try { created = create(a.m); } catch (e) { createErr = String(e.message ?? e); }
  const saved = (await a.m.saveXML({ format: true })).xml;
  const doc = new DOMParser().parseFromString(saved, "application/xml");
  const q = (name) => [...doc.getElementsByTagNameNS("http://www.omg.org/spec/BPMN/20100524/MODEL", name)];
  out.updater = {
    legendInstanceUpdaterClass: protoBefore,
    createInLegend: createErr ?? "ok",
    ioSpecification: q("ioSpecification").length,
    inputSet: q("inputSet").length,
    outputSet: q("outputSet").length,
    dataInputRefInSet: q("dataInputRefs").length,
    dataInputs: q("dataInput").length,
  };
  a.m.get("commandStack").undo();
  const afterUndo = (await a.m.saveXML()).xml;
  out.updater.dataInputsAfterUndo = (afterUndo.match(/<bpmn:dataInput /g) ?? []).length;
  let plainErr = null;
  try { create(plain.m); } catch (e) { plainErr = String(e.message ?? e); }
  out.updater.plainInstanceCreate = plainErr ?? "ok (unexpected)";
  out.updater.plainUpdaterClass = Object.getPrototypeOf(plain.m.get("bpmnUpdater")).constructor.name;

  // Destroy A: B keeps drawing, its ids remain.
  a.m.destroy(); a.host.remove();
  out.afterDestroyA = { bDefIds: defIds(b.host), bTaskStillLegend: info(b.host, "T1").legend };

  window.__pic = true;
  b.m.destroy(); plain.m.destroy();
  return out;
};
window.__ready = true;
