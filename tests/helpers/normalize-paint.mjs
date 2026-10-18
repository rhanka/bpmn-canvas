// CSSOM serializes colours and dash lists differently from SVG attributes.
// Canonicalize equivalent paint values while keeping geometry and colour differences strict.
export function normalizePaint(element) {
  return { ...element, primitives: element.primitives.map((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => {
    if (k === "stroke-dasharray") return [k, v.replace(/[,\s]+/g, " ").trim()];
    if (k !== "fill" && k !== "stroke") return [k, v];
    const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(v);
    let channels = rgb?.slice(1).map(Number);
    const hsl = /^hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)$/.exec(v);
    if (hsl) {
      const h = Number(hsl[1]) / 30, s = Number(hsl[2]) / 100, l = Number(hsl[3]) / 100;
      const a = s * Math.min(l, 1 - l);
      channels = [0, 8, 4].map((n) => {
        const k = (n + h) % 12;
        return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
      });
    }
    return [k, channels ? "#" + channels.map((c) => c.toString(16).padStart(2, "0")).join("") : v];
  }))) };
}
