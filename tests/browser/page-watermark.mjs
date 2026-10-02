// The bpmn.io logo: visible by default, hidden only on an explicit request that names a license.
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { createBpmnCanvas } from "../../dist/index.js";
import { BpmnCanvas } from "../../dist/react/index.js";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="D" targetNamespace="http://example.org/wm">
  <bpmn:process id="P"><bpmn:task id="T" name="Task"/></bpmn:process>
  <bpmndi:BPMNDiagram id="BD"><bpmndi:BPMNPlane id="PL" bpmnElement="P"><bpmndi:BPMNShape id="dT" bpmnElement="T"><dc:Bounds x="100" y="100" width="100" height="80"/></bpmndi:BPMNShape></bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mount = () => {
  const el = document.createElement("div");
  el.style.cssText = "width:500px;height:300px;position:relative";
  document.body.appendChild(el);
  return el;
};
const badge = (host) => {
  const b = host.querySelector(".bjs-powered-by");
  if (!b) return { present: false };
  const cs = getComputedStyle(b);
  const r = b.getBoundingClientRect();
  return { present: true, visible: cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0 };
};

window.runWatermark = async () => {
  const out = {};
  const run = async (name, watermark) => {
    const host = mount();
    const seen = [];
    const h = createBpmnCanvas(host, { xml: XML, ...(watermark !== undefined ? { watermark } : {}), onDiagnostic: (d) => seen.push(d.code) });
    await h.ready;
    await sleep(50);
    out[name] = { badge: badge(host), emitted: seen.filter((c) => c === "watermark-refused").length, listed: h.getDiagnostics().filter((d) => d.code === "watermark-refused").map((d) => d.severity), attr: host.querySelector(".bpmn-canvas")?.getAttribute("data-bpmn-canvas-watermark") ?? null };
    h.destroy();
    host.remove();
  };
  await run("default");
  await run("hiddenFalse", { hidden: false, license: "L-1" });
  await run("licensed", { hidden: true, license: "L-1" });
  await run("noLicense", { hidden: true });
  await run("blankLicense", { hidden: true, license: "   " });

  // React: the prop reaches the canvas
  for (const [name, watermark] of [["reactDefault", undefined], ["reactLicensed", { hidden: true, license: "L-2" }], ["reactRefused", { hidden: true, license: "" }]]) {
    const host = mount();
    const root = createRoot(host);
    root.render(createElement(BpmnCanvas, { xml: XML, ...(watermark ? { watermark } : {}) }));
    for (let i = 0; i < 100 && !host.querySelector(".djs-container"); i++) await sleep(50);
    await sleep(150);
    out[name] = { badge: badge(host) };
    root.unmount();
    host.remove();
  }
  return out;
};
window.__ready = true;
