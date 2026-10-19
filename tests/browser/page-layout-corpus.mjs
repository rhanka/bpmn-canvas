// Layout corpus, geometry applied to the DI (test list §10.2): the canvas's auto-layout of an invented document gives
// the corpus boxes and waypoints.
import { createBpmnCanvas } from "../../dist/index.js";
import c1 from "../fixtures/io/reference/C1/diagram.bpmn";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

window.corpus = {
  async run() {
    const host = document.createElement("div");
    host.style.cssText = "width:1000px;height:600px;position:relative";
    document.getElementById("app").appendChild(host);
    // Everything moved away from the laid-out geometry first, so the layout has to put it back.
    // Pools retain their origin during auto-layout; perturb their contents only.
    const moved = c1.replace(/(<bpmndi:BPMNShape\b[^>]*>[\s\S]*?<dc:Bounds x=")(\d+)(" y=")(\d+)"/g, (all, a, x, b, y) =>
      a.includes('bpmnElement="Order_handling_pool"') ? all : `${a}${Number(x) + 7}${b}${Number(y) + 3}"`);
    const h = createBpmnCanvas(host, { xml: moved });
    await h.ready;
    await h.autoLayout();
    await sleep(100);
    const registry = h.modeler.get("elementRegistry");
    const nodes = {};
    const edges = {};
    for (const e of registry.getAll()) {
      const bo = e.businessObject;
      if (!bo || e.type === "label" || e.type === "bpmn:Participant" || e.type === "bpmn:Lane" || e.type === "bpmn:Collaboration" || e.type === "bpmn:Process") continue;
      const text = bo.name ?? (typeof bo.text === "string" ? bo.text.replace(/^\[Reference\]\s*/, "") : undefined);
      if (e.waypoints) {
        const pts = e.waypoints.map((p) => [p.x, p.y]);
        // The corpus connection is document→activity; BPMN associations are activity→document.
        edges[e.id] = e.type === "bpmn:Association" && bo.targetRef?.text?.startsWith("[Reference]") ? pts.reverse() : pts;
      }
      else if (text && !String(bo.text ?? "").startsWith("[Component]")) nodes[text] = { x: e.x, y: e.y, w: e.width, h: e.height };
    }
    h.destroy();
    host.remove();
    return { nodes, edges };
  },
};
window.__ready = true;
