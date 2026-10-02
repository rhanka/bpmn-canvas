// Renders the demo diagram with each profile (static SVG, no editing engine).
import { renderDiagrams } from "../../dist/index.js";

window.demo = {
  async render(xml, options) {
    const r = await renderDiagrams(xml, options);
    return { diagrams: r.diagrams.map((d) => ({ id: d.id, name: d.name, svg: d.svg })), diagnostics: r.diagnostics };
  },
};
window.__ready = true;
