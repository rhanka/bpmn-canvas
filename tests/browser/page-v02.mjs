import { createBpmnCanvas } from "../../dist/index.js";

const app = document.getElementById("app");
const items = new Map();
let seq = 0;
const NS = 'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI"';

window.v02 = {
  NS,
  async mount(xml, options = {}, size = { width: 700, height: 420 }) {
    const id = ++seq;
    const host = document.createElement("div");
    host.id = `host-${id}`;
    host.style.cssText = `width:${size.width}px;height:${size.height}px;position:relative;margin:6px`;
    app.appendChild(host);
    const log = { clicks: [], history: [], changes: [], diagnostics: [] };
    const handle = createBpmnCanvas(host, {
      xml,
      ...options,
      onElementClick: (c) => log.clicks.push(c),
      onHistoryChange: (h) => log.history.push(h),
      onChange: (c) => log.changes.push(c),
      onDiagnostic: (d) => log.diagnostics.push(d),
    });
    items.set(id, { id, host, handle, log });
    await handle.ready;
    return { id, hostId: host.id, state: handle.state };
  },
  get: (id) => items.get(id),
  log: (id) => items.get(id).log,
  async call(id, method, ...args) {
    const r = await items.get(id).handle[method](...args);
    return r === undefined ? null : r;
  },
  zoom: (id) => items.get(id).handle.getZoom(),
  resize(id, width, height) {
    const h = items.get(id).host;
    h.style.width = `${width}px`;
    h.style.height = `${height}px`;
  },
  edit(id, eid, name) {
    const m = items.get(id).handle.modeler;
    m.get("modeling").updateProperties(m.get("elementRegistry").get(eid), { name });
  },
  rectOf(id, selector) {
    const el = items.get(id).host.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  },
  count: (id, selector) => items.get(id).host.querySelectorAll(selector).length,
  destroy(id) {
    const i = items.get(id);
    i.handle.destroy();
    i.host.remove();
    items.delete(id);
  },
  wideXml() {
    const tasks = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<bpmn:task id="T${i}" name="Task ${i}"/>`).join("");
    const shapes = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<bpmndi:BPMNShape id="dT${i}" bpmnElement="T${i}"><dc:Bounds x="${200 + i * 520}" y="100" width="100" height="80"/></bpmndi:BPMNShape>`).join("");
    return `<?xml version="1.0"?><bpmn:definitions ${NS} id="D" targetNamespace="x"><bpmn:process id="P" isExecutable="false"><bpmn:startEvent id="S"/>${tasks}</bpmn:process><bpmndi:BPMNDiagram id="BD"><bpmndi:BPMNPlane id="PL" bpmnElement="P"><bpmndi:BPMNShape id="dS" bpmnElement="S"><dc:Bounds x="100" y="122" width="36" height="36"/></bpmndi:BPMNShape>${shapes}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>`;
  },
  callXml() {
    return `<?xml version="1.0"?><bpmn:definitions ${NS} id="D" targetNamespace="x"><bpmn:process id="P" isExecutable="false"><bpmn:callActivity id="CA" name="Call" calledElement="Other_Proc"/></bpmn:process><bpmndi:BPMNDiagram id="BD"><bpmndi:BPMNPlane id="PL" bpmnElement="P"><bpmndi:BPMNShape id="dCA" bpmnElement="CA" isExpanded="false"><dc:Bounds x="200" y="100" width="100" height="80"/></bpmndi:BPMNShape></bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>`;
  },
};
window.__ready = true;
