// Shared proof: legend look rendered, fonts and images loaded from the CDN, watermark option, edit round trip.
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="D" targetNamespace="http://example.org/cdn">
  <bpmn:collaboration id="C"><bpmn:participant id="PA" name="Pool" processRef="P"/></bpmn:collaboration>
  <bpmn:process id="P" isExecutable="false">
    <bpmn:laneSet id="LS"><bpmn:lane id="L1" name="Lane"><bpmn:flowNodeRef>S</bpmn:flowNodeRef><bpmn:flowNodeRef>T</bpmn:flowNodeRef><bpmn:flowNodeRef>E</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>
    <bpmn:startEvent id="S"/><bpmn:task id="T" name="Review"/><bpmn:endEvent id="E"/>
    <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="T"/><bpmn:sequenceFlow id="F2" sourceRef="T" targetRef="E"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BD"><bpmndi:BPMNPlane id="PL" bpmnElement="C">
    <bpmndi:BPMNShape id="dPA" bpmnElement="PA" isHorizontal="true"><dc:Bounds x="100" y="50" width="700" height="250"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dL1" bpmnElement="L1" isHorizontal="true"><dc:Bounds x="130" y="50" width="670" height="250"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dS" bpmnElement="S"><dc:Bounds x="200" y="152" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dT" bpmnElement="T"><dc:Bounds x="320" y="130" width="120" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dE" bpmnElement="E"><dc:Bounds x="540" y="152" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="dF1" bpmnElement="F1"><di:waypoint x="236" y="170"/><di:waypoint x="320" y="170"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="dF2" bpmnElement="F2"><di:waypoint x="440" y="170"/><di:waypoint x="540" y="170"/></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

export async function runProof(api, variant) {
  const nonce = document.querySelector('meta[name="csp-nonce"]')?.content;
  const external = document.querySelector('meta[name="bpmn-styles"]')?.content === "external";
  const assetBase = document.querySelector('meta[name="asset-base"]')?.content;
  const styleOpts = { ...(external ? { styles: "external" } : nonce ? { styleNonce: nonce } : {}), ...(assetBase ? { assetBase } : {}) };
  const changes = [];
  const main = api.createBpmnCanvas(document.getElementById("canvas"), {
    xml: XML,
    profile: "legend",
    fitMode: "none",
    ...styleOpts,
    onChange: (c) => changes.push(c.cause),
  });
  await main.ready;
  const hidden = api.createBpmnCanvas(document.getElementById("canvas2"), { xml: XML, watermark: { hidden: true, license: "proof-license" }, ...styleOpts });
  await hidden.ready;
  await document.fonts.load("14px bpmn").catch(() => []);
  await new Promise((r) => setTimeout(r, 1500)); // the canvas checks its styles, font and images after the first import
  window.__api = { main, changes, getXml: () => main.getXml() };
  const glyph = getComputedStyle(document.querySelector(".djs-palette .entry[data-action^='legend.']")).getPropertyValue("--bpmn-canvas-legend-glyph").trim();
  const badge = (sel) => { const b = document.querySelector(`${sel} .bjs-powered-by`); return b ? getComputedStyle(b).display !== "none" : null; };
  return {
    variant,
    exports: Object.keys(api).sort(),
    state: main.state,
    legendShapes: document.querySelectorAll("#canvas .legend-shape").length,
    fontReady: document.fonts.check("14px bpmn"),
    glyph,
    badgeDefaultVisible: badge("#canvas"),
    badgeHiddenWithLicense: badge("#canvas2") === false,
    styleTags: [...document.querySelectorAll("style")].map((s) => s.nonce || s.getAttribute("nonce") || "no-nonce"),
    diagnostics: main.getDiagnostics().map((d) => d.code),
    notice: document.querySelector("#canvas .bpmn-canvas__asset-notice")?.textContent ?? null,
    noticeVisible: (() => { const n = document.querySelector("#canvas .bpmn-canvas__asset-notice"); if (!n) return false; const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && n.getAttribute("role") === "alert"; })(),
    canvasHeight: document.querySelector("#canvas .bpmn-canvas").getBoundingClientRect().height,
  };
}
