import Modeler from "bpmn-js/lib/Modeler";
import { createBpmnCanvas } from "../../dist/index.js";
import { PaletteSupportModule } from "../../dist/internal/palette.js";

const NS = 'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"';
const XML = `<?xml version="1.0"?><bpmn:definitions ${NS} id="D" targetNamespace="x"><bpmn:process id="P" isExecutable="false"><bpmn:task id="T" name="Task"/></bpmn:process><bpmndi:BPMNDiagram id="BD"><bpmndi:BPMNPlane id="PL" bpmnElement="P"><bpmndi:BPMNShape id="dT" bpmnElement="T"><dc:Bounds x="200" y="100" width="100" height="80"/></bpmndi:BPMNShape></bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>`;

const app = document.getElementById("app");
const items = new Map();
let seq = 0;
const styleAttrWrites = [];
const origSetAttribute = Element.prototype.setAttribute;
Element.prototype.setAttribute = function (name, value) {
  if (name === "style" && this.classList?.contains("bpmn-canvas")) styleAttrWrites.push(String(value));
  return origSetAttribute.call(this, name, value);
};

const host = (w, h) => {
  const el = document.createElement("div");
  el.style.cssText = `width:${w}px;height:${h}px;position:relative;margin:4px`;
  app.appendChild(el);
  return el;
};

const paletteInfo = (el) => {
  const p = el.querySelector(".djs-palette");
  const r = p?.getBoundingClientRect();
  return p ? { open: p.classList.contains("open"), twoColumn: p.classList.contains("two-column"), width: Math.round(r.width), entries: p.querySelectorAll(".entry").length } : null;
};

const ENTRY_PROPS = ["color", "backgroundColor", "width", "height", "fontFamily"];
const entryStyles = (el) => {
  const out = {};
  for (const e of el.querySelectorAll(".djs-palette .entry")) {
    const cs = getComputedStyle(e);
    const before = getComputedStyle(e, "::before");
    out[e.getAttribute("data-action") || e.className] = { ...Object.fromEntries(ENTRY_PROPS.map((k) => [k, cs[k]])), beforeContent: before.content, beforeColor: before.color, beforeBg: before.backgroundColor };
  }
  return out;
};

window.pal = {
  XML,
  styleAttrWrites,
  async mount(options = {}, size = { w: 700, h: 900 }, xml = XML) {
    const id = ++seq;
    const el = host(size.w, size.h);
    const h = createBpmnCanvas(el, { xml, ...options });
    items.set(id, { el, h });
    await h.ready;
    await new Promise((r) => setTimeout(r, 120));
    return id;
  },
  info: (id) => paletteInfo(items.get(id).el),
  async resize(id, w, hgt) {
    const { el } = items.get(id);
    el.style.width = `${w}px`;
    el.style.height = `${hgt}px`;
    await new Promise((r) => setTimeout(r, 300));
  },
  async call(id, m, ...a) {
    const r = await items.get(id).h[m](...a);
    await new Promise((x) => setTimeout(x, 200));
    return r === undefined ? null : r;
  },
  root: (id) => {
    const r = items.get(id).el.querySelector(".bpmn-canvas");
    const vars = {};
    for (let i = 0; i < r.style.length; i++) { const n = r.style[i]; if (n.startsWith("--bpmn-canvas-icon")) vars[n] = r.style.getPropertyValue(n); }
    return { vars, colored: r.classList.contains("bpmn-canvas--colored") };
  },
  styles: (id) => entryStyles(items.get(id).el),
  maskImages(id) {
    const out = {};
    for (const e of items.get(id).el.querySelectorAll('.djs-palette .entry[data-action^="legend."]')) {
      const b = getComputedStyle(e, "::before");
      out[e.getAttribute("data-action")] = b.webkitMaskImage || b.maskImage;
    }
    return out;
  },
  badge: (id) => { const b = items.get(id).el.querySelector(".bjs-powered-by"); return !!b && getComputedStyle(b).display !== "none"; },
  destroy(id) { const i = items.get(id); i.h.destroy?.(); i.el.remove(); items.delete(id); },
  async plain(options = {}) {
    const el = host(700, 900);
    const root = document.createElement("div");
    root.className = options.rootClass ?? "";
    root.style.cssText = "width:100%;height:100%;position:relative";
    el.appendChild(root);
    const m = new Modeler({ container: root, ...(options.modules ? { additionalModules: options.modules, bpmnCanvas: options.config } : {}) });
    await m.importXML(XML);
    await new Promise((r) => setTimeout(r, 150));
    const id = ++seq;
    items.set(id, { el, h: { destroy: () => m.destroy() } });
    return id;
  },
  PaletteSupportModule,
};
window.__ready = true;
