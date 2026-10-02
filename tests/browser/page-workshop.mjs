import { StrictMode, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { BpmnWorkshop } from "../../dist/react/index.js";

const app = document.getElementById("app");
const items = new Map();
let seq = 0;

function Harness({ id, opts }) {
  const it = items.get(id);
  const [state, setState] = useState({ xml: opts.xml, revision: undefined });
  const [extra, setExtra] = useState(opts.extra ?? {});
  it.setState = setState;
  it.setExtra = setExtra;
  const props = {
    xml: state.xml,
    revision: state.revision,
    ...extra,
    ref: (h) => {
      it.ref = h;
    },
    onXmlChange: (xml, change) => {
      it.log.xmlChanges.push({ xml, cause: change.cause, revision: change.revision });
      if (opts.echo) setState({ xml, revision: change.revision });
    },
    onChange: (c) => it.log.changes.push(c.cause),
    onDiagnostic: (d) => it.log.diagnostics.push(d.code),
    onDownload: (f) => it.log.downloads.push(f),
    onAutoLayoutError: (e) => it.log.layoutErrors.push(String(e?.message ?? e)),
    onFormatChange: (f) => it.log.formats.push(f),
    ...(opts.importHandler ? { onImport: (r) => it.log.imports.push({ projected: r.projected, fidelity: r.fidelity.map((x) => x.code), xml: r.xml }) } : {}),
    ...(opts.customResolve ? { resolveTarget: (click, diagrams, active) => { it.log.resolves.push({ click, diagrams: diagrams.map((d) => d.id), active }); return opts.customResolve === "none" ? null : opts.customResolve; } } : {}),
  };
  return createElement(BpmnWorkshop, props);
}

window.ws = {
  mount(xml, opts = {}, size = { width: 900, height: 560 }, strict = false, shadow = false) {
    const id = ++seq;
    const host = document.createElement("div");
    host.id = `ws-host-${id}`;
    host.style.cssText = `width:${size.width}px;height:${size.height}px;margin:6px;position:relative`;
    app.appendChild(host);
    let mountEl = host;
    if (shadow) {
      const root = host.attachShadow({ mode: "open" });
      mountEl = document.createElement("div");
      mountEl.style.cssText = "width:100%;height:100%";
      root.appendChild(mountEl);
    }
    const log = { xmlChanges: [], changes: [], diagnostics: [], downloads: [], layoutErrors: [], formats: [], imports: [], resolves: [] };
    const it = { id, host, mountEl, log, root: createRoot(mountEl), ref: null, opts, xml0: xml };
    items.set(id, it);
    const el = createElement(Harness, { id, opts: { ...opts, xml } });
    it.root.render(strict ? createElement(StrictMode, null, el) : el);
    return { id, hostId: host.id };
  },
  it: (id) => items.get(id),
  log: (id) => items.get(id).log,
  async ready(id, ms = 8000) {
    const it = items.get(id);
    const t0 = Date.now();
    const scope = () => it.mountEl;
    while (Date.now() - t0 < ms) {
      const w = scope().querySelector(".bpmn-workshop");
      if (w && w.getAttribute("data-state") === "ready") return true;
      await new Promise((r) => setTimeout(r, 25));
    }
    return false;
  },
  setExtra: (id, extra) => items.get(id).setExtra((e) => ({ ...e, ...extra })),
  setXml: (id, xml, revision) => items.get(id).setState({ xml, revision }),
  q: (id, sel) => items.get(id).mountEl.querySelector(sel) !== null,
  qa: (id, sel) => items.get(id).mountEl.querySelectorAll(sel).length,
  text: (id, sel) => items.get(id).mountEl.querySelector(sel)?.textContent ?? null,
  attr: (id, sel, name) => items.get(id).mountEl.querySelector(sel)?.getAttribute(name) ?? null,
  rect(id, sel) {
    const el = items.get(id).mountEl.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  },
  disabled: (id, sel) => items.get(id).mountEl.querySelector(sel)?.disabled ?? null,
  canvasHandle: (id) => items.get(id).ref?.canvas ?? null,
  async getXml(id) { return items.get(id).ref.getXml(); },
  zoom: (id) => items.get(id).ref.canvas.getZoom(),
  active: (id) => items.get(id).ref.canvas.getActiveDiagramId(),
  stubLayoutFailure(id) { items.get(id).ref.canvas.autoLayout = () => Promise.reject(new Error("boom")); },
  unmount(id) { const it = items.get(id); it.root.unmount(); it.host.remove(); items.delete(id); },
};
window.__ready = true;
