// Lab page: consumer of the packed package plus its own bpmn-js (for E4 and E9).
import { createBpmnCanvas, renderDiagrams } from "@sentropic/bpmn-canvas";
import Modeler from "bpmn-js/lib/Modeler";
import BpmnUpdater from "bpmn-js/lib/features/modeling/BpmnUpdater";

const app = document.getElementById("app");
const instances = new Map();
let seq = 0;

const corpusText = (name) => fetch(`./corpus/${name}.bpmn`).then((r) => r.text());
const sha256 = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");

function makeHost({ hidden = false, width = 700, height = 420 } = {}) {
  const wrap = document.createElement("div");
  wrap.style.cssText = hidden ? "display:none" : "margin:6px";
  const el = document.createElement("div");
  el.style.cssText = `width:${width}px;height:${height}px;position:relative`;
  wrap.appendChild(el);
  app.appendChild(wrap);
  return { wrap, el };
}

async function mount(name, options = {}) {
  const { hidden, width, height, ...rest } = options;
  const id = ++seq;
  const xml = await corpusText(name);
  const { wrap, el } = makeHost({ hidden, width, height });
  el.id = `host-${id}`;
  const log = { changes: [], diagnostics: [], states: [] };
  const handle = createBpmnCanvas(el, {
    xml,
    ...rest,
    onChange: (c) => log.changes.push(c),
    onDiagnostic: (d) => log.diagnostics.push(d),
    onStateChange: (s) => log.states.push(s),
  });
  const button = document.createElement("button");
  button.type = "button";
  button.id = `export-${id}`;
  button.textContent = "Export";
  button.addEventListener("click", () => window.lab.exportDownload(id));
  wrap.appendChild(button);
  instances.set(id, { id, handle, xml, wrap, el, log });
  await handle.ready;
  return { id, hostId: el.id, state: handle.state };
}

const get = (id) => instances.get(id);

window.lab = {
  corpusText,
  sha256,
  mount,
  get,
  info: (id) => {
    const i = get(id);
    return { state: i.handle.state, readOnly: i.handle.isReadOnly(), reason: i.handle.getReadOnlyReason(), active: i.handle.getActiveDiagramId(), diagrams: i.handle.getDiagrams(), canUndo: i.handle.canUndo(), diagnostics: i.log.diagnostics, changes: i.log.changes };
  },
  getXml: (id) => get(id).handle.getXml(),
  inputSha: async (id) => sha256(get(id).xml),
  call: async (id, method, ...args) => {
    const r = await get(id).handle[method](...args);
    return r === undefined ? null : r;
  },
  destroy: (id) => {
    const i = get(id);
    i.handle.destroy();
    i.wrap.remove();
    instances.delete(id);
  },
  async exportDownload(id) {
    const xml = await get(id).handle.getXml();
    const blob = new Blob([xml], { type: "application/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    window.__lastExport = xml;
    a.download = "export.bpmn";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return { sha: await sha256(xml), length: xml.length };
  },
  renderDiagrams,

  // XML helpers (parsed in the browser).
  async shapeX(id, eid) {
    const doc = new DOMParser().parseFromString(await get(id).handle.getXml(), "application/xml");
    const shape = [...doc.getElementsByTagNameNS("http://www.omg.org/spec/BPMN/20100524/DI", "BPMNShape")].find((n) => n.getAttribute("bpmnElement") === eid);
    const b = shape?.getElementsByTagNameNS("http://www.omg.org/spec/DD/20100524/DC", "Bounds")[0];
    return b ? Number(b.getAttribute("x")) : null;
  },
  async analyze(id, mustExist = []) {
    const xml = await get(id).handle.getXml();
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const ids = new Set([...doc.querySelectorAll("[id]")].map((n) => n.getAttribute("id")));
    const dangling = [];
    for (const n of doc.getElementsByTagName("*")) for (const a of n.attributes) if ((/Ref$/.test(a.name) || a.name === "bpmnElement") && !ids.has(a.value)) dangling.push(`${n.getAttribute("id") ?? n.localName}@${a.name}=${a.value}`);
    return { parses: !doc.querySelector("parsererror"), missing: mustExist.filter((x) => !ids.has(x)), dangling };
  },
  async nameOf(id, eid) {
    const doc = new DOMParser().parseFromString(await get(id).handle.getXml(), "application/xml");
    return doc.querySelector(`[id="${eid}"]`)?.getAttribute("name") ?? null;
  },
  async hasElement(id, eid) {
    const doc = new DOMParser().parseFromString(await get(id).handle.getXml(), "application/xml");
    return !!doc.querySelector(`[id="${eid}"]`);
  },
  viewbox(id) {
    const svg = get(id).el.querySelector("svg");
    const g = svg.querySelector(".viewport");
    return g?.getAttribute("transform") ?? null;
  },

  // E5 + E6, driven through the public API only.
  async lifecycle() {
    const out = {};
    const { el, wrap } = makeHost();
    const xml = await corpusText("ce1-homonyms");
    for (let i = 0; i < 50; i++) {
      const h = createBpmnCanvas(el, { xml });
      h.destroy();
      await h.ready;
    }
    const kept = createBpmnCanvas(el, { xml });
    await kept.ready;
    out.e5ContainersAfter50 = el.querySelectorAll(".djs-container").length;
    kept.destroy();
    out.e5ContainersAfterDestroy = el.querySelectorAll(".djs-container").length;

    const changes = [];
    const h = createBpmnCanvas(el, { xml: "", onChange: (c) => changes.push(c) });
    const [tA, tB, tC] = await Promise.all([corpusText("ce1-homonyms"), corpusText("ce3-collapsed-subprocess"), corpusText("ce4-two-pools-message")]);
    const a = h.setXml(tA);
    const b = h.setXml(tB);
    out.e6aRejects = await a.then(() => null, (e) => e.name);
    out.e6bApplied = (await b).applied;
    const c = h.setXml(tC);
    h.destroy();
    out.e6cRejects = await c.then(() => null, (e) => e.name);
    out.e6ChangesAfterDestroy = changes.length;
    wrap.remove();
    return out;
  },

  // E7: switching diagram while a layout is pending leaves label and content coherent.
  async e7() {
    const { id } = await mount("ce5-two-diagrams-shared-root");
    const h = get(id).handle;
    const host = get(id).el;
    const layout = h.autoLayout();
    const sw = h.selectDiagram("DiagB");
    const settled = await Promise.allSettled([layout, sw]);
    const shown = (eid) => !!host.querySelector(`.djs-element[data-element-id="${eid}"]`);
    const out = { active: h.getActiveDiagramId(), showsB: shown("TO"), showsA: shown("TS"), settled: settled.map((s) => s.status) };
    destroyAll(id);
    return out;
  },

  // E4: standard profile markup vs a plain upstream Modeler on the same document.
  async e4() {
    const xml = await corpusText("notation");
    const norm = (html) => html.replace(/marker-[a-z0-9]+/g, "marker-X").replace(/url\(#[^)]+\)/g, "url(#X)").replace(/ id="[^"]*"/g, "");
    const ours = await mount("notation", { width: 900, height: 600 });
    const hostB = makeHost({ width: 900, height: 600 });
    const plain = new Modeler({ container: hostB.el });
    await plain.importXML(xml);
    const oursEl = get(ours.id).el;
    const ids = [...plain.get("elementRegistry").getAll()].map((e) => e.id).filter((x) => !x.startsWith("__"));
    const visual = (root, eid) => root.querySelector(`.djs-element[data-element-id="${eid}"] .djs-visual`)?.innerHTML ?? null;
    const diffs = [];
    let compared = 0;
    for (const eid of ids) {
      const a = visual(oursEl, eid);
      const b = visual(hostB.el, eid);
      if (a === null && b === null) continue;
      compared++;
      if (a === null || b === null || norm(a) !== norm(b)) diffs.push({ id: eid, ours: a === null ? null : norm(a).slice(0, 200), upstream: b === null ? null : norm(b).slice(0, 200) });
    }
    return { compared, diffs, oursHostId: ours.hostId, plainHostId: (hostB.el.id = "host-plain-e4") };
  },

  // E9: a host with its own bpmn-js: our canvas (legend profile) must not change the host's behavior.
  async e9() {
    const xml = await corpusText("notation");
    const hostA = makeHost();
    const hostModeler = new Modeler({ container: hostA.el });
    await hostModeler.importXML(xml);
    const createDataInput = () => {
      try {
        hostModeler.get("modeling").createShape({ type: "bpmn:DataInput" }, { x: 500, y: 300 }, hostModeler.get("canvas").getRootElement());
        return "ok";
      } catch (e) {
        return String(e.message ?? e);
      }
    };
    const protoFns = () => Object.getOwnPropertyNames(BpmnUpdater.prototype).filter((k) => typeof BpmnUpdater.prototype[k] === "function").map((k) => `${k}:${BpmnUpdater.prototype[k].toString().length}`).join("|");
    const before = { dataInput: createDataInput(), proto: protoFns(), badges: document.querySelectorAll(".bjs-powered-by").length, updaterIsUpstream: Object.getPrototypeOf(hostModeler.get("bpmnUpdater")) === BpmnUpdater.prototype };
    try { hostModeler.get("commandStack").undo(); } catch { /* nothing to undo after the upstream error */ }
    const { id } = await mount("notation", { profile: "legend" });
    const ours = get(id).handle;
    const after = { dataInput: createDataInput(), proto: protoFns(), badges: document.querySelectorAll(".bjs-powered-by").length, updaterIsUpstream: Object.getPrototypeOf(hostModeler.get("bpmnUpdater")) === BpmnUpdater.prototype };
    const badge = hostA.el.querySelector(".bjs-powered-by");
    const cs = badge && getComputedStyle(badge);
    return { before, after, hostBadgeVisible: !!badge && cs.display !== "none" && cs.visibility !== "hidden", ourState: ours.state };
  },
};

function destroyAll(id) {
  window.lab.destroy(id);
}

window.__ready = true;
