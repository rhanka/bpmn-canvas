// Workshop exports: served passthrough (test list §4.3–4.10) and atomicity (§8).
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { BpmnWorkshop } from "../../dist/react/index.js";
import * as io from "../../dist/io/index.js";
import c1 from "../fixtures/io/reference/C1/semantic.bpmn";
import c1drawio from "../fixtures/io/reference/C1/expected.drawio";
import c2 from "../fixtures/io/reference/C2/semantic.bpmn";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ENV = { host: "test-host", drawio: { agent: "test-agent" }, sparx: { exporter: "test-exporter", exporterVersion: "9.9" } };
const LABELS = { export: "Export", exportBpmn: "BPMN", exportDrawio: "Drawio", exportSparx: "Sparx", exportFailed: "Export failed" };
const served = (tag) => ({
  drawio: { bytes: `<mxfile served="${tag}"/>`, filename: "diagram.drawio", mimeType: "application/vnd.jgraph.mxfile", version: tag },
  sparx: { bytes: `<sparx served="${tag}"/>`, filename: "diagram.sparx.xml", mimeType: "application/xml", version: tag },
});
const REFUSED = c1.replaceAll("bpmn:exclusiveGateway", "bpmn:inclusiveGateway");

function mountWorkshop(props) {
  const host = document.createElement("div");
  host.style.cssText = "width:1000px;height:600px;position:relative";
  document.getElementById("app").appendChild(host);
  const root = createRoot(host);
  const downloads = [];
  const ref = { current: null };
  let current = props;
  const render = (next) => {
    current = { ...current, ...next };
    root.render(h(BpmnWorkshop, { ref, labels: LABELS, ioOptions: ENV, onDownload: (file, context) => downloads.push({ file, context }), ...current }));
  };
  render({});
  return { host, root, downloads, ref, render, dispose: () => { root.unmount(); host.remove(); } };
}
const ready = async (w) => {
  for (let i = 0; i < 150 && !w.host.querySelector(".djs-element[data-element-id]"); i++) await sleep(30);
  await sleep(100);
};
async function openExport(w) {
  const trigger = [...w.host.querySelectorAll('[role="toolbar"] button[aria-haspopup]')].find((b) => /Export/.test(b.textContent + (b.getAttribute("aria-label") ?? "")));
  trigger.click();
  await sleep(60);
  const items = Object.fromEntries([...document.querySelectorAll('[role="menu"]:not([hidden]) [role="menuitem"]')].map((m) => [m.textContent.trim(), m]));
  return { trigger, items };
}
async function itemStates(w) {
  const { trigger, items } = await openExport(w);
  const out = Object.fromEntries(Object.entries(items).map(([k, m]) => [k, m.getAttribute("aria-disabled") === "true" || m.hasAttribute("data-disabled")]));
  trigger.click();
  await sleep(60);
  return out;
}
async function exportAs(w, label) {
  const before = w.downloads.length;
  const { items } = await openExport(w);
  items[label].click();
  for (let i = 0; i < 60 && w.downloads.length === before && !w.host.querySelector(".bpmn-workshop__notice"); i++) await sleep(30);
  await sleep(50);
  return w.downloads.length > before ? w.downloads.at(-1) : null;
}
const notices = (w) => [...w.host.querySelectorAll(".bpmn-workshop__notice")].map((n) => ({ role: n.getAttribute("role"), text: n.querySelector("span")?.textContent ?? "" }));
const rename = (w, id, name) => {
  const m = w.ref.current.canvas.modeler;
  m.get("modeling").updateLabel(m.get("elementRegistry").get(id), name);
};
const effective = async (context, fmt) => { io.initializeCodecs(ENV); return new TextDecoder().decode(await io.export((await io.parseDefinitions(context.xml)).rootElement, fmt)); };

window.exportsPage = {
  async local() {
    const out = {};
    const w = mountWorkshop({ xml: c1, served: served("stale") });
    await ready(w);
    out.menu = await itemStates(w);
    out.drawio = (await exportAs(w, "Drawio"))?.file.xml;
    out.sparx = (await exportAs(w, "Sparx"))?.file.xml;
    rename(w, "Ship_order", "Current shipment"); await sleep(100);
    out.edit = (await exportAs(w, "Drawio"))?.file.xml;
    w.ref.current.canvas.undo(); await sleep(100);
    out.undo = (await exportAs(w, "Drawio"))?.file.xml;
    w.dispose();
    const bad = mountWorkshop({ xml: REFUSED, served: served("stale") }); await ready(bad);
    out.refused = await exportAs(bad, "Drawio"); out.notices = notices(bad);
    out.bpmn = (await exportAs(bad, "BPMN"))?.file.xml;
    bad.dispose(); return out;
  },

  async atomicity() {
    const out = {};
    // 8.1 / 8.7: one capture; the downloaded bytes are exportDiagram(context.xml) with the effective options.
    {
      const w = mountWorkshop({ xml: c1, formats: [{ id: "custom", label: "Custom", profile: "legend" }] });
      await ready(w);
      rename(w, "Check_order", "Check it");
      await sleep(100);
      const files = {};
      for (const label of ["BPMN", "Drawio", "Sparx"]) files[label] = await exportAs(w, label);
      const c = files.BPMN.context;
      out.context = { keys: Object.keys(c).sort(), diagramId: c.diagramId, active: w.ref.current.canvas.getActiveDiagramId(), profile: c.profile, touched: c.touched, revisionIsString: typeof c.revision === "string" };
      out.bytes = {
        bpmn: files.BPMN.file.xml === c.xml,
        drawio: files.Drawio.file.xml === await effective(files.Drawio.context, "drawio"),
        sparx: files.Sparx.file.xml === await effective(files.Sparx.context, "sparx"),
      };
      w.dispose();
    }
    // 8.2: a pending direct edit is committed into the file; a drag in progress refuses the export.
    {
      const w = mountWorkshop({ xml: c1 });
      await ready(w);
      const m = w.ref.current.canvas.modeler;
      m.get("directEditing").activate(m.get("elementRegistry").get("Check_order"));
      const box = w.host.querySelector(".djs-direct-editing-content");
      if (box) { box.textContent = "Typed name"; box.dispatchEvent(new Event("input", { bubbles: true })); }
      const bpmn = await exportAs(w, "BPMN");
      out.directEdit = { inFile: bpmn?.file.xml.includes('name="Typed name"') ?? false };
      const shape = m.get("elementRegistry").get("Ship_order");
      const down = new MouseEvent("mousedown", { clientX: 500, clientY: 200 });
      Object.defineProperty(down, "target", { value: m.get("elementRegistry").getGraphics(shape) });
      m.get("move").start(down, shape);
      m.get("dragging").move(new MouseEvent("mousemove", { clientX: 540, clientY: 230 }));
      const during = await exportAs(w, "BPMN");
      out.drag = { file: during !== null, notices: notices(w).length };
      m.get("dragging").cancel();
      w.dispose();
    }
    // 8.3: undo, page switch and look switch right after the export click: file and context stay consistent.
    for (const action of ["undo", "page", "look"]) {
      const w = mountWorkshop({ xml: c2, formats: [{ id: "a", label: "A", profile: "legend" }, { id: "b", label: "B", profile: "colored" }] });
      await ready(w);
      await w.ref.current.canvas.selectDiagram(w.ref.current.canvas.getDiagrams()[1].id);
      rename(w, "Price_items", "Price all items");
      await sleep(100);
      const { items } = await openExport(w);
      items.BPMN.click();
      const canvas = w.ref.current.canvas;
      if (action === "undo") canvas.undo();
      if (action === "page") void canvas.selectDiagram(canvas.getDiagrams()[1].id);
      if (action === "look") w.render({ format: "b" });
      for (let i = 0; i < 60 && !w.downloads.length; i++) await sleep(30);
      const got = w.downloads.at(-1);
      out[`switch_${action}`] = got ? { consistent: got.file.xml === got.context.xml, diagramIsKnown: canvas.getDiagrams().some((d) => d.id === got.context.diagramId) } : { notice: notices(w) };
      w.dispose();
    }
    // 8.4: superseded by a newer document while capturing → AbortError → notice, no file; local import invalidates served.
    {
      const w = mountWorkshop({ xml: c1, served: served("v1") });
      await ready(w);
      rename(w, "Check_order", "Edited");
      await sleep(100);
      const { items } = await openExport(w);
      items.BPMN.click();
      w.render({ xml: c2, served: served("v2") });
      await sleep(400);
      out.superseded = { files: w.downloads.length, notices: notices(w).length };
      const input = w.host.querySelector('[data-testid="bpmn-workshop-file"]');
      const dt = new DataTransfer();
      dt.items.add(new File([c1.replace('name="Order handling"', 'name="Imported"')], "local.bpmn", { type: "application/xml" }));
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      for (let i = 0; i < 60 && !w.host.querySelector('[role="tab"]')?.textContent.includes("Imported"); i++) await sleep(50);
      out.afterImport = await itemStates(w);
      w.dispose();
    }
    // 8.5: a refusal → an alert notice, no file; BPMN still exportable.
    {
      const w = mountWorkshop({ xml: REFUSED });
      await ready(w);
      rename(w, "Check_order", "Edited");
      await sleep(100);
      const refused = await exportAs(w, "Drawio");
      out.refusal = { file: refused !== null, notices: notices(w) };
      out.refusal.bpmn = (await exportAs(w, "BPMN"))?.file.filename;
      w.dispose();
    }
    // 8.6: edit then undo: touched stays true, the codec output equals the unedited case's expected bytes.
    {
      const w = mountWorkshop({ xml: c1 });
      await ready(w);
      rename(w, "Ship_order", "Changed");
      await sleep(100);
      w.ref.current.canvas.undo();
      await sleep(150);
      const d = await exportAs(w, "Drawio");
      out.editUndo = { touched: d?.context.touched, equal: d?.file.xml === c1drawio };
      w.dispose();
    }
    // 8.8: resize — whole re-fits, readable keeps the view.
    for (const fitMode of ["whole", "readable"]) {
      const w = mountWorkshop({ xml: c1, fitMode });
      await ready(w);
      const canvas = w.ref.current.canvas.modeler.get("canvas");
      const before = canvas.viewbox();
      w.host.style.width = "600px";
      await sleep(400);
      const after = canvas.viewbox();
      out[`resize_${fitMode}`] = { changed: Math.abs(before.scale - after.scale) > 1e-6 || Math.abs(before.x - after.x) > 0.5 };
      w.dispose();
    }
    return out;
  },
};
window.__ready = true;
