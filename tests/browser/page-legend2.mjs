// Legend profile parity (headers, [App] box, marker hit areas, tokens, palette) through the public API.
import { createBpmnCanvas } from "../../dist/index.js";
import { DEFAULT_LEGEND_TOKENS, LEGEND_ACTION_IDS } from "../../dist/profiles/legend/index.js";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="D" targetNamespace="http://example.org/legend2">
  <bpmn:collaboration id="C"><bpmn:participant id="PA" name="Pool A" processRef="P"/></bpmn:collaboration>
  <bpmn:process id="P" isExecutable="false">
    <bpmn:laneSet id="LS">
      <bpmn:lane id="L1" name="Lane 1"><bpmn:flowNodeRef>S</bpmn:flowNodeRef><bpmn:flowNodeRef>T</bpmn:flowNodeRef><bpmn:flowNodeRef>G</bpmn:flowNodeRef><bpmn:flowNodeRef>CA</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="L2" name="Lane 2"><bpmn:flowNodeRef>SP</bpmn:flowNodeRef><bpmn:flowNodeRef>DO</bpmn:flowNodeRef></bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="S"/>
    <bpmn:task id="T" name="Fill form"/>
    <bpmn:exclusiveGateway id="G"/>
    <bpmn:callActivity id="CA" name="Other process"/>
    <bpmn:subProcess id="SP" name="Sub"/>
    <bpmn:dataObjectReference id="DO" name="Data"/>
    <bpmn:textAnnotation id="APP"><bpmn:text>[App] SAP</bpmn:text></bpmn:textAnnotation>
    <bpmn:textAnnotation id="DOC"><bpmn:text>[Doc] Form</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="A1" sourceRef="T" targetRef="APP"/>
    <bpmn:association id="A2" sourceRef="T" targetRef="DOC"/>
    <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="T"/>
    <bpmn:sequenceFlow id="F2" sourceRef="T" targetRef="G"/>
    <bpmn:sequenceFlow id="F3" sourceRef="G" targetRef="CA"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BD"><bpmndi:BPMNPlane id="PL" bpmnElement="C">
    <bpmndi:BPMNShape id="dPA" bpmnElement="PA" isHorizontal="true"><dc:Bounds x="100" y="50" width="900" height="420"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dL1" bpmnElement="L1" isHorizontal="true"><dc:Bounds x="130" y="50" width="870" height="220"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dL2" bpmnElement="L2" isHorizontal="true"><dc:Bounds x="130" y="270" width="870" height="200"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dS" bpmnElement="S"><dc:Bounds x="180" y="122" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dT" bpmnElement="T"><dc:Bounds x="260" y="100" width="120" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dG" bpmnElement="G" isMarkerVisible="true"><dc:Bounds x="440" y="115" width="50" height="50"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dCA" bpmnElement="CA"><dc:Bounds x="560" y="100" width="120" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dSP" bpmnElement="SP" isExpanded="false"><dc:Bounds x="260" y="310" width="120" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dDO" bpmnElement="DO"><dc:Bounds x="440" y="310" width="36" height="50"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dAPP" bpmnElement="APP"><dc:Bounds x="280" y="170" width="80" height="30"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dDOC" bpmnElement="DOC"><dc:Bounds x="400" y="190" width="120" height="50"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="dA1" bpmnElement="A1"><di:waypoint x="320" y="180"/><di:waypoint x="320" y="170"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="dA2" bpmnElement="A2"><di:waypoint x="360" y="180"/><di:waypoint x="400" y="200"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="dF1" bpmnElement="F1"><di:waypoint x="216" y="140"/><di:waypoint x="260" y="140"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="dF2" bpmnElement="F2"><di:waypoint x="380" y="140"/><di:waypoint x="440" y="140"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="dF3" bpmnElement="F3"><di:waypoint x="490" y="140"/><di:waypoint x="560" y="140"/></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const CUSTOM = {
  fontFamily: "serif", fontSize: 13, strokeWidth: 2, stroke: "#aa0001", fill: "#aa0002", text: "#aa0003", headerText: "#aa0004", flow: "#aa0005", link: "#aa0006",
  taskLine: "#aa0007", taskFill: "#aa0008", taskFillEnd: "#aa0009", eventLine: "#aa000a", eventFill: "#aa000b", gatewayLine: "#aa000c", gatewayFill: "#aa000d",
  poolLine: "#aa000e", poolFill: "#aa000f", laneLine: "#aa0010", laneFill: "#aa0011", externalLine: "#aa0012", externalFill: "#aa0013",
  docLine: "#aa0014", docFill: "#aa0015", dataLine: "#aa0016", dataFill: "#aa0017", appLine: "#aa0018", appFill: "#aa0019",
};

const mount = () => {
  const el = document.createElement("div");
  el.style.cssText = "width:1100px;height:560px;position:relative";
  document.body.appendChild(el);
  return el;
};
const hex = (v) => {
  const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(String(v).trim());
  return m ? "#" + m.slice(1).map((n) => Number(n).toString(16).padStart(2, "0")).join("") : String(v).trim().toLowerCase();
};
const gfx = (host, id) => host.querySelector(`.djs-element[data-element-id="${id}"]`);
const visual = (host, id) => gfx(host, id)?.querySelector(".djs-visual");

async function open(options = {}) {
  const host = mount();
  const diags = [];
  const h = createBpmnCanvas(host, { xml: XML, profile: "legend", onDiagnostic: (d) => diags.push(d), ...options });
  await h.ready;
  return { host, h, diags };
}

function headerReport(host, cls) {
  return [...host.querySelectorAll(`.${cls}`)].map((rect) => {
    const g = rect.parentElement;
    return { height: Number(rect.getAttribute("height")), transform: g.querySelector("text.djs-label")?.getAttribute("transform") ?? null };
  });
}

function hitAt(host, element, where) {
  const marker = element.querySelector(".legend-marker");
  const body = element.querySelector(".djs-visual > .legend-shape > rect");
  const rect = (where === "marker" ? marker : body).getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const hit = document.elementFromPoint(x, y);
  return { insideElement: !!hit && element.contains(hit), isMarker: !!hit?.closest(".legend-marker"), cls: hit?.getAttribute("class") ?? hit?.tagName ?? null };
}

window.runLegend2 = async () => {
  const out = {};
  const { host, h, diags } = await open();
  out.state = h.state;
  out.diagnostics = diags.map((d) => d.code);

  // (a) pool and lane header labels.
  out.poolHeaders = headerReport(host, "legend-pool-strip");
  out.laneHeaders = headerReport(host, "legend-lane-header");

  // (b) [App] box under its task; [App] and its link hidden, [Doc] and its link kept.
  const task = gfx(host, "T");
  const app = task.querySelector("g.legend-app");
  out.app = app && {
    transform: app.getAttribute("transform"),
    width: app.querySelector("rect")?.getAttribute("width"),
    height: app.querySelector("rect")?.getAttribute("height"),
    hasIcon: !!app.querySelector("path"),
    text: app.textContent,
  };
  const display = (id) => gfx(host, id)?.style.display || getComputedStyle(gfx(host, id)).display;
  out.visibility = { APP: display("APP"), A1: display("A1"), DOC: display("DOC"), A2: display("A2") };

  // (c) click targets: body is not a marker, the marker is.
  out.hit = {
    callActivityBody: hitAt(host, gfx(host, "CA"), "body"),
    callActivityIcon: hitAt(host, gfx(host, "CA"), "marker"),
    subProcessBody: hitAt(host, gfx(host, "SP"), "body"),
    subProcessMarker: hitAt(host, gfx(host, "SP"), "marker"),
    taskBody: (() => {
      const r = visual(host, "T").querySelector(".legend-task").getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 8, r.top + 8);
      return { insideElement: !!hit && gfx(host, "T").contains(hit), isMarker: !!hit?.closest(".legend-marker") };
    })(),
  };

  // palette.
  out.palette = {
    entries: [...host.querySelectorAll(".djs-palette .entry")].map((e) => e.getAttribute("data-action")),
    ids: [...LEGEND_ACTION_IDS],
    styled: [...host.querySelectorAll('.djs-palette .entry[data-action^="legend."]')].map((e) => {
      const cs = getComputedStyle(e, "::before");
      const box = e.getBoundingClientRect();
      return { id: e.getAttribute("data-action"), mask: (cs.maskImage || cs.webkitMaskImage || "").startsWith("url("), w: cs.width, boxW: box.width, boxH: box.height };
    }),
    badge: (() => { const b = host.querySelector(".bjs-powered-by"); return !!b && getComputedStyle(b).display !== "none"; })(),
  };
  h.destroy();

  // standard profile: the legend palette rules never apply.
  const std = await open({ profile: "standard" });
  out.standard = {
    legendEntries: std.host.querySelectorAll('.djs-palette .entry[data-action^="legend."]').length,
    entries: std.host.querySelectorAll(".djs-palette .entry").length,
    legendShapes: std.host.querySelectorAll(".legend-shape").length,
  };
  std.h.destroy();

  // (d) custom tokens reach the SVG.
  const c = await open({ legendTokens: CUSTOM });
  const H = c.host;
  // tiny-svg writes presentation properties into the style attribute: read the computed style.
  const attr = (el, name) => (el ? hex(getComputedStyle(el).getPropertyValue(name)) : null);
  const firstShape = (id, sel) => visual(H, id)?.querySelector(`.legend-shape ${sel}`);
  const gradient = H.querySelector("linearGradient[id$='legend-task-gradient']");
  const stops = gradient ? [...gradient.querySelectorAll("stop")].map((s) => hex(getComputedStyle(s).stopColor)) : [];
  const labelFill = (el) => (el ? hex(getComputedStyle(el).fill) : null);
  out.custom = {
    taskStroke: attr(firstShape("T", "rect.legend-task"), "stroke"),
    taskBody: (getComputedStyle(firstShape("T", "rect.legend-task")).fill ?? "").startsWith("url("),
    gradient: stops,
    eventFill: attr(firstShape("S", "circle"), "fill"),
    eventStroke: attr(firstShape("S", "circle"), "stroke"),
    gatewayFill: attr(firstShape("G", "path"), "fill"),
    gatewayStroke: attr(firstShape("G", "path"), "stroke"),
    poolFill: attr(H.querySelector(".legend-pool-strip"), "fill"),
    poolStroke: attr(H.querySelector(".legend-pool-strip"), "stroke"),
    laneFill: attr(H.querySelector(".legend-lane-header"), "fill"),
    laneStroke: attr(H.querySelector(".legend-lane-header"), "stroke"),
    externalFill: attr(firstShape("CA", "rect"), "fill"),
    externalStroke: attr(firstShape("CA", "rect"), "stroke"),
    dataFill: attr(firstShape("DO", ".legend-data-page"), "fill"),
    dataStroke: attr(firstShape("DO", ".legend-data-page"), "stroke"),
    docFill: attr(firstShape("DOC", "path"), "fill"),
    docStroke: attr(firstShape("DOC", "path"), "stroke"),
    appFill: attr(gfx(H, "T").querySelector("g.legend-app rect"), "fill"),
    appStroke: attr(gfx(H, "T").querySelector("g.legend-app rect"), "stroke"),
    flow: attr(H.querySelector(".legend-flow"), "stroke"),
    flowMarker: (() => { const m = H.querySelector("marker[id$='legend-arrow'] path"); return m ? hex(getComputedStyle(m).fill) : null; })(),
    link: attr(H.querySelector(".legend-link"), "stroke"),
    headerText: labelFill(H.querySelector(".legend-pool-strip")?.parentElement.querySelector("text.djs-label")),
    strokeWidth: getComputedStyle(H.querySelector(".legend-flow")).strokeWidth,
  };
  c.h.destroy();

  // defaults.
  const d = await open();
  const dg = d.host.querySelector("linearGradient[id$='legend-task-gradient']");
  out.defaults = { tokens: { ...DEFAULT_LEGEND_TOKENS }, gradient: dg ? [...dg.querySelectorAll("stop")].map((s) => hex(getComputedStyle(s).stopColor)) : [] };
  d.h.destroy();
  return out;
};
window.__ready = true;
