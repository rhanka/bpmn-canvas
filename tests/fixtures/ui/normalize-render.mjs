// Normalisation shared by the recorded step-0 rendering (step0-render.json) and the library's rendering in
// tests/render-looks.browser.test.mjs: paint as numbers and lower-case colours, gradients by kind only, texts
// without whitespace (text layout depends on the font metrics of the environment), paths with single spaces.
const NUMERIC = new Set(["stroke-width", "fontSize", "r", "rx", "ry", "cx", "cy", "x", "y", "width", "height", "x1", "y1", "x2", "y2"]);
const colour = (v) => (/^url\(/.test(v) ? "url()" : /^#[0-9a-f]{3,8}$/i.test(v) ? v.toLowerCase() : v);
export function normalizePrimitive(p) {
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === null || v === undefined) continue;
    if (k === "text") out.text = String(v).replace(/\s+/g, "");
    else if (k === "d" || k === "points") out[k] = String(v).replace(/,/g, " ").replace(/\s+/g, " ").trim();
    else if (NUMERIC.has(k)) out[k] = String(Number.parseFloat(v));
    else if (k === "fill" || k === "stroke") out[k] = colour(String(v));
    else out[k] = String(v);
  }
  return out;
}
export const normalizeElement = (e) => ({ hidden: e.hidden, primitives: e.primitives.map(normalizePrimitive) });
