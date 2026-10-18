// Rendering in both looks (test list §7b): SVG primitives of every element of R1, normalised like the recorded
// step-0 rendering; labels inside their shapes; the initial view.
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { BpmnWorkshop } from "../../dist/react/index.js";
import r1 from "../fixtures/ui/R1.bpmn";
import { normalizeElement } from "../fixtures/ui/normalize-render.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** The step-0 BPMN-look colours, passed as the host's tokens. */
const BPMN_TOKENS = {
  text: "#3a3a3a", headerText: "#3a3a3a", labelText: "hsl(225, 10%, 15%)",
  taskLine: "#8a7f72", taskFill: "#f6f1ea", taskFillEnd: "#ECE2D4", gatewayLine: "#2f7a4f", gatewayFill: "#60BE89",
  eventLine: "#8a2d2d", eventFill: "#E27676", externalLine: "#b59b00", externalFill: "#fff59d", dataLine: "#8a7f72",
  dataFill: "#efe9e1", docLine: "#b8860b", docFill: "#ffe599", appLine: "#3a8a8a", appFill: "#99ffff",
  laneLine: "#b9b2a8", laneFill: "#fbf9f6", poolLine: "#0F3180", poolFill: "#eee7df",
};
const FORMATS = [
  { id: "custom", label: "Custom", profile: "legend", palette: "legend" },
  { id: "bpmn", label: "BPMN", profile: "colored", tokens: BPMN_TOKENS, palette: "legend", drawing: "classic" },
];

const GEOM = ["x", "y", "width", "height", "rx", "ry", "cx", "cy", "r", "d", "points", "x1", "y1", "x2", "y2", "transform"];
const PAINT = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity", "fill-opacity", "display", "visibility"];
function paintOf(el) {
  const out = {};
  const style = el.getAttribute("style") ?? "";
  for (const decl of style.split(";")) {
    const [k, v] = decl.split(":").map((s) => s?.trim());
    if (k && v && PAINT.includes(k)) out[k] = v;
  }
  for (const k of PAINT) { const v = el.getAttribute(k); if (v !== null) out[k] = v; }
  if (el.getAttribute("marker-end") || /marker-end/.test(style)) out["marker-end"] = "yes";
  if (el.getAttribute("marker-start") || /marker-start/.test(style)) out["marker-start"] = "yes";
  return out;
}
function primitives(visual) {
  const out = [];
  for (const el of [...visual.querySelectorAll("rect, circle, ellipse, path, line, polyline, polygon, text")]) {
    const tag = el.tagName.toLowerCase();
    if (tag === "text") {
      out.push({ tag, text: [...el.querySelectorAll("tspan")].map((t) => t.textContent).join("\n") || el.textContent, fontSize: el.getAttribute("font-size") ?? (el.getAttribute("style") ?? "").match(/font-size:\s*([^;]+)/)?.[1] ?? null, fontWeight: (el.getAttribute("style") ?? "").match(/font-weight:\s*([^;]+)/)?.[1] ?? el.getAttribute("font-weight"), ...paintOf(el) });
      continue;
    }
    const geom = {};
    for (const k of GEOM) { const v = el.getAttribute(k); if (v !== null) geom[k] = v; }
    out.push({ tag, ...geom, ...paintOf(el) });
  }
  return out;
}

/** Text boxes of an activity, in its own coordinates, against its shape box. */
function overflow(host, id) {
  const g = host.querySelector(`.djs-element[data-element-id="${id}"]`);
  const shape = g?.querySelector(":scope > .djs-visual rect");
  if (!g || !shape) return null;
  const w = Number(shape.getAttribute("width"));
  const hgt = Number(shape.getAttribute("height"));
  // Application labels belong to their own box below the activity, not its embedded label.
  return [...g.querySelectorAll(":scope > .djs-visual text")].filter((t) => !t.closest(".legend-app")).map((t) => {
    const b = t.getBBox();
    const m = g.getCTM().inverse().multiply(t.getCTM());
    return { inside: b.x + m.e >= -0.5 && b.y + m.f >= -0.5 && b.x + m.e + b.width <= w + 0.5 && b.y + m.f + b.height <= hgt + 0.5 };
  });
}

window.renderLooks = {
  async run() {
    const out = {};
    const host = document.getElementById("app");
    host.style.cssText = "width:1200px;height:700px;position:relative";
    const root = createRoot(host);
    const ref = { current: null };
    for (const look of ["custom", "bpmn"]) {
      // The recorded step-0 editor lays out server documents on load.
      root.render(h(BpmnWorkshop, { ref, xml: r1, layoutOnLoad: true, formats: FORMATS, format: look }));
      for (let i = 0; i < 150 && !host.querySelector('.djs-element[data-element-id="Log_request"]'); i++) await sleep(30);
      await sleep(500);
      const elements = {};
      for (const g of [...host.querySelectorAll(".djs-element[data-element-id]")]) {
        const id = g.getAttribute("data-element-id");
        const visual = g.querySelector(":scope > .djs-visual");
        elements[id] = normalizeElement({ hidden: g.style.display === "none", primitives: visual ? primitives(visual) : [] });
      }
      const vb = ref.current.canvas.modeler.get("canvas").viewbox();
      out[look] = {
        elements,
        overflow: { long: overflow(host, "Check_the_incoming_request_against_all_the_applicable_rules_and_record_the_outcome"), app: overflow(host, "Log_request") },
        view: { x: Math.round(vb.x), y: Math.round(vb.y), scale: Number(vb.scale.toFixed(4)), contentFits: vb.outer.width >= vb.inner.width * vb.scale - 1 },
      };
    }
    root.unmount();
    return out;
  },
};
window.__ready = true;
