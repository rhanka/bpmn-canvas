import { createBpmnCanvas, renderDiagrams } from "../../dist/index.js";

const app = document.getElementById("app");
const items = new Map();
let seq = 0;

const COLOUR_PROPS = ["fill", "stroke", "stop-color", "marker-start", "marker-end", "marker-mid"];
const colour = (n, prop) => n.style?.getPropertyValue(prop) || n.getAttribute?.(prop) || "";

/** Markup of an element's visual with ids and marker references normalized; colours optionally stripped. */
function normalized(node, stripColours) {
  const clone = node.cloneNode(true);
  for (const n of [clone, ...clone.querySelectorAll("*")]) {
    n.removeAttribute("id");
    for (const prop of COLOUR_PROPS) if (stripColours) n.removeAttribute(prop);
    const style = n.getAttribute?.("style");
    if (style !== null && style !== undefined) {
      const kept = style
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean)
        .filter((d) => !(stripColours && COLOUR_PROPS.includes(d.split(":")[0].trim())))
        .map((d) => d.replace(/url\(["']?#[^)"']+["']?\)/g, "url(#X)"));
      if (kept.length) n.setAttribute("style", kept.join("; "));
      else n.removeAttribute("style");
    }
  }
  return clone.outerHTML.replace(/marker-[a-z0-9]+/g, "marker-X");
}

function markerFacts(value) {
  const m = /url\(["']?#([^)"']+)["']?\)/.exec(value ?? "");
  if (!m) return null;
  const el = document.getElementById(m[1]);
  if (!el) return { missing: m[1] };
  return { id: m[1], parts: [...el.querySelectorAll("*")].map((c) => ({ stroke: colour(c, "stroke"), fill: colour(c, "fill") })) };
}

window.col = {
  async mount(xml, options = {}) {
    const id = ++seq;
    const host = document.createElement("div");
    host.id = `host-${id}`;
    host.style.cssText = "width:900px;height:600px;position:relative;margin:6px";
    app.appendChild(host);
    const diagnostics = [];
    const handle = createBpmnCanvas(host, { xml, ...options, onDiagnostic: (d) => diagnostics.push(d) });
    items.set(id, { id, host, handle, diagnostics });
    await handle.ready;
    return { id, state: handle.state, hasRenderer: !!handle.modeler?.get("coloredRenderer", false) };
  },
  markup(id, strip) {
    const out = {};
    for (const g of items.get(id).host.querySelectorAll(".djs-element")) {
      const v = g.querySelector(".djs-visual");
      if (v) out[g.getAttribute("data-element-id")] = normalized(v, strip);
    }
    return out;
  },
  facts(id) {
    const out = {};
    for (const g of items.get(id).host.querySelectorAll(".djs-element")) {
      const v = g.querySelector(".djs-visual");
      if (!v) continue;
      const all = [...v.querySelectorAll("*")];
      const first = v.querySelector(":scope > rect, :scope > circle, :scope > polygon, :scope > path");
      const strokes = [...new Set(all.map((n) => colour(n, "stroke")).filter((s) => s && s !== "none"))];
      const connection = g.classList.contains("djs-connection");
      const path = connection ? v.querySelector(":scope > path") : null;
      out[g.getAttribute("data-element-id")] = {
        connection,
        strokes,
        firstFill: first ? colour(first, "fill") : null,
        firstStroke: first ? colour(first, "stroke") : null,
        texts: [...v.querySelectorAll("text")].map((t) => colour(t, "fill")),
        circles: v.querySelectorAll("circle").length,
        paths: v.querySelectorAll("path").length,
        markerEnd: path ? markerFacts(colour(path, "marker-end")) : null,
        markerStart: path ? markerFacts(colour(path, "marker-start")) : null,
        mainPathStroke: path ? colour(path, "stroke") : null,
      };
    }
    return out;
  },
  markerIds: () => [...document.querySelectorAll("marker[id], linearGradient[id], defs [id]")].map((n) => n.id),
  edit(id, spec) {
    const it = items.get(id);
    const m = it.handle.modeler;
    const reg = m.get("elementRegistry");
    if (spec.move) m.get("modeling").moveElements([reg.get(spec.move[0])], { x: spec.move[1], y: spec.move[2] });
    if (spec.rename) m.get("modeling").updateProperties(reg.get(spec.rename[0]), { name: spec.rename[1] });
    if (spec.create) {
      const parent = spec.create.parent ? reg.get(spec.create.parent) : m.get("canvas").getRootElement();
      const shape = m.get("modeling").createShape({ type: spec.create.type }, { x: spec.create.x, y: spec.create.y }, parent);
      return shape.id;
    }
    return null;
  },
  destroy(id) {
    const it = items.get(id);
    it.handle.destroy();
    it.host.remove();
    items.delete(id);
  },
  async render(xml, options) {
    const r = await renderDiagrams(xml, options);
    return { diagrams: r.diagrams.map((d) => ({ id: d.id, svg: d.svg })), diagnostics: r.diagnostics };
  },
};
window.__ready = true;
