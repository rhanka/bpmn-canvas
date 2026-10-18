// layoutOnLoad (test list §5), on invented documents whose tasks were shrunk to 60×40 so a layout is visible.
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { createBpmnCanvas } from "../../dist/index.js";
import { BpmnWorkshop } from "../../dist/react/index.js";
import c1 from "../fixtures/io/reference/C1/diagram.bpmn";
import c2 from "../fixtures/io/reference/C2/diagram.bpmn";

const shrink = (xml) => xml.replace(/width="120" height="80"/g, 'width="60" height="40"');
const TINY = shrink(c1);
const TINY2 = shrink(c2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mount = (w = 900, h = 520) => {
  const el = document.createElement("div");
  el.style.cssText = `width:${w}px;height:${h}px;position:relative;margin:4px`;
  document.getElementById("app").appendChild(el);
  return el;
};
const box = (h, id) => {
  const e = h.modeler.get("elementRegistry").get(id);
  return e ? [e.width, e.height] : null;
};
const rename = (h, id, name) => h.modeler.get("modeling").updateLabel(h.modeler.get("elementRegistry").get(id), name);
/** Counts the layout runs of the current modeler. */
function countRuns(h) {
  const svc = h.modeler.get("bpmnCanvasLayout");
  const real = svc.run.bind(svc);
  const counter = { n: 0 };
  svc.run = (...a) => { counter.n++; return real(...a); };
  return counter;
}
const catchName = async (p) => { try { await p; return "resolved"; } catch (e) { return e?.name ?? String(e); } };

window.loadLayout = {
  async run() {
    const out = {};
    // 1. Server document laid out: no undo step, no onChange, exact input bytes.
    {
      const host = mount();
      const changes = [];
      const h = createBpmnCanvas(host, { xml: TINY, layoutOnLoad: true, onChange: (c) => changes.push(c.cause) });
      await h.ready;
      await sleep(50);
      out.server = { task: box(h, "Check_order"), canUndo: h.canUndo(), changes: [...changes], sameBytes: (await h.getXml()) === TINY };
      // 8. After an edit, the shown diagram is saved with its laid-out DI.
      rename(h, "Ship_order", "Ship order now");
      await sleep(50);
      out.afterEdit = /bpmnElement="Check_order">\s*<dc:Bounds x="[^"]*" y="[^"]*" width="(\d+)" height="(\d+)"/.exec(await h.getXml())?.slice(1).map(Number);
      h.destroy(); host.remove();
    }
    // 2. layoutOnLoad false keeps the DI.
    {
      const host = mount();
      const h = createBpmnCanvas(host, { xml: TINY });
      await h.ready;
      out.kept = { task: box(h, "Check_order"), canUndo: h.canUndo(), sameBytes: (await h.getXml()) === TINY };
      h.destroy(); host.remove();
    }
    // 3. Second diagram laid out on its first display only, once.
    {
      const host = mount();
      const changes = [];
      const h = createBpmnCanvas(host);
      await h.ready;
      const runs = countRuns(h);
      await h.setXml(TINY2, { layoutOnLoad: true });
      const [, d2] = h.getDiagrams();
      // An unopened diagram has DI in the definitions, no element in the active registry.
      const pendingShape = h.modeler.getDefinitions().diagrams.find((d) => d.id === d2.id).plane.planeElement.find((s) => s.bpmnElement?.id === "Price_items");
      const before = [pendingShape.bounds.width, pendingShape.bounds.height];
      await h.selectDiagram(d2.id);
      const after = box(h, "Price_items");
      await h.selectDiagram(h.getDiagrams()[0].id);
      await h.selectDiagram(d2.id);
      out.deferred = { before, after, runs: runs.n, canUndo: h.canUndo(), changes, sameBytes: (await h.getXml()) === TINY2 };
      h.destroy(); host.remove();
    }
    // 4. Failure: input re-imported, warning diagnostic, editable.
    {
      const host = mount();
      const diagnostics = [];
      const changes = [];
      const h = createBpmnCanvas(host, { onDiagnostic: (d) => diagnostics.push([d.code, d.severity]), onChange: (c) => changes.push(c.cause) });
      await h.ready;
      h.modeler.get("bpmnCanvasLayout").run = () => Promise.reject(new Error("layout broke"));
      const result = await h.setXml(TINY, { layoutOnLoad: true });
      out.failure = { result, diagnostics, task: box(h, "Check_order"), sameBytes: (await h.getXml()) === TINY, state: h.state, canUndo: h.canUndo() };
      rename(h, "Ship_order", "Edited");
      await sleep(50);
      out.failure.editable = changes.length > 0;
      h.destroy(); host.remove();
    }
    // 5. setXml and destroy() during the load layout.
    for (const how of ["setXml", "destroy"]) {
      const host = mount();
      const changes = [];
      const diagnostics = [];
      const h = createBpmnCanvas(host, { onChange: (c) => changes.push(c.cause), onDiagnostic: (d) => diagnostics.push(d.code) });
      await h.ready;
      const svc = h.modeler.get("bpmnCanvasLayout");
      const real = svc.run.bind(svc);
      let release;
      const gate = new Promise((r) => (release = r));
      let entered;
      const inLayout = new Promise((r) => (entered = r));
      svc.run = (...a) => { entered(); return gate.then(() => real(...a)); };
      const first = h.setXml(TINY, { layoutOnLoad: true });
      await inLayout;
      const before = diagnostics.length;
      const second = how === "setXml" ? h.setXml(c1) : (h.destroy(), null);
      release();
      out[`during_${how}`] = { first: await catchName(first), second: second ? await catchName(second) : null, changes, newDiagnostics: diagnostics.slice(before), state: h.state };
      if (how === "setXml") out.during_setXml.task = box(h, "Check_order");
      if (h.state !== "destroyed") h.destroy();
      host.remove();
    }
    // 6. Echo, profile switch and undo/redo across a switch never lay out.
    {
      const host = mount();
      const changes = [];
      const h = createBpmnCanvas(host, { onChange: (c) => changes.push(c) });
      await h.ready;
      await h.setXml(TINY, { layoutOnLoad: true, revision: "r1" });
      const runs = countRuns(h);
      await h.setXml(TINY, { layoutOnLoad: true, revision: "r1" });
      rename(h, "Ship_order", "Edited");
      await sleep(30);
      await h.setProfile("colored");
      const afterSwitch = countRuns(h);
      h.undo();
      await sleep(300);
      out.never = { echoRuns: runs.n, switchRuns: afterSwitch.n, undone: h.modeler.get("elementRegistry").get("Ship_order").businessObject.name };
      h.destroy(); host.remove();
    }
    // 7. Read-only lifted for the load layout and restored, failure included.
    {
      const host = mount();
      const h = createBpmnCanvas(host, { xml: TINY, layoutOnLoad: true, readOnly: true });
      await h.ready;
      out.readOnly = { task: box(h, "Check_order"), readOnly: h.isReadOnly() };
      h.modeler.get("bpmnCanvasLayout").run = () => Promise.reject(new Error("layout broke"));
      await h.setXml(c1.replace('name="Ship order"', 'name="Ship"'), { layoutOnLoad: true });
      out.readOnly.afterFailure = h.isReadOnly();
      h.destroy(); host.remove();
    }
    // Workshop: layoutOnLoad prop, onAutoLayoutError on a load failure.
    {
      const host = mount();
      const errors = [];
      const r = createRoot(host);
      r.render(createElement(BpmnWorkshop, { xml: TINY, layoutOnLoad: true, onAutoLayoutError: (e) => errors.push(String(e?.message ?? e)) }));
      for (let i = 0; i < 100 && !host.querySelector('[data-element-id="Check_order"]'); i++) await sleep(30);
      await sleep(100);
      const g = host.querySelector('.djs-element[data-element-id="Check_order"] rect');
      out.workshop = { width: Number(g?.getAttribute("width")), errors: [...errors] };
      // A later document whose load layout fails: onAutoLayoutError, the document still shown with its DI.
      const ref = { current: null };
      r.render(createElement(BpmnWorkshop, { ref, xml: TINY, layoutOnLoad: true, onAutoLayoutError: (e) => errors.push(String(e?.message ?? e)) }));
      await sleep(50);
      ref.current.canvas.modeler.get("bpmnCanvasLayout").run = () => Promise.reject(new Error("layout broke"));
      r.render(createElement(BpmnWorkshop, { ref, xml: TINY2, layoutOnLoad: true, onAutoLayoutError: (e) => errors.push(String(e?.message ?? e)) }));
      for (let i = 0; i < 100 && !errors.length; i++) await sleep(30);
      out.workshop.failureErrors = [...errors];
      out.workshop.shownAfterFailure = !!host.querySelector('.djs-element[data-element-id="Sales_overview"], .djs-element[data-element-id="Start"]');
      r.unmount(); host.remove();
    }
    return out;
  },
};
window.__ready = true;
