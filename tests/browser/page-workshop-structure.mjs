// Workshop structure with the step-0 contract options (test list §7): toolbar, open menus and palette, normalised the
// same way as the recorded fixture (tests/fixtures/ui/step0-structure.json).
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { BpmnWorkshop } from "../../dist/react/index.js";
import xml from "../fixtures/io/reference/C1/semantic.bpmn";
import fixture from "../fixtures/ui/step0-structure.json";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GEOM = /^(d|x|y|cx|cy|r|rx|ry|x1|y1|x2|y2|points|width|height|viewBox)$/;
const svgOf = (el) => [...el.querySelectorAll("svg, svg *")].map((p) => `${p.tagName.toLowerCase()}:${[...p.attributes].filter((a) => GEOM.test(a.name)).map((a) => `${a.name}=${a.value}`).join(",")}`);
function control(el, toolbar) {
  // Closed popups stay mounted for Menu consumers; their contents are not toolbar controls.
  const visible = el.cloneNode(true);
  visible.querySelectorAll("[hidden]").forEach((node) => node.remove());
  const text = (visible.textContent ?? "").replace(/\s+/g, " ").trim();
  const group = el.parentElement?.closest('[role="group"]');
  return {
    role: el.getAttribute("role") ?? (el.tagName === "BUTTON" ? "button" : el.tagName.toLowerCase()),
    name: el.getAttribute("aria-label") ?? text,
    title: el.getAttribute("title"),
    text,
    disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true" || el.hasAttribute("data-disabled"),
    ariaPressed: el.getAttribute("aria-pressed"),
    ariaChecked: el.getAttribute("aria-checked"),
    hasPopup: el.getAttribute("aria-haspopup"),
    inGroup: group && toolbar.contains(group) ? group.getAttribute("aria-label") : null,
    svg: svgOf(visible),
  };
}
function menuItems(menu) {
  const out = [];
  const walk = (node) => {
    for (const child of [...node.children]) {
      const role = child.getAttribute("role");
      const text = (child.textContent ?? "").replace(/\s+/g, " ").trim();
      if (role === "menuitem" || role === "menuitemcheckbox" || role === "menuitemradio") {
        out.push({ kind: "item", role, text, disabled: child.getAttribute("aria-disabled") === "true" || child.hasAttribute("data-disabled") || child.disabled === true, ariaPressed: child.getAttribute("aria-pressed"), ariaChecked: child.getAttribute("aria-checked"), svg: svgOf(child) });
      } else if (role === "separator") {
        out.push({ kind: "separator" });
      } else if (role === "group" || (!text && child.children.length)) {
        walk(child);
      } else if (text) {
        out.push({ kind: "header", text });
      }
    }
  };
  walk(menu);
  return out;
}

/** The host's undo/redo icons: the same SVG nodes the step-0 toolbar showed. */
const icon = (svg) => {
  const [root, ...children] = svg;
  const attrs = (s) => Object.fromEntries(s.slice(s.indexOf(":") + 1).split(",").filter(Boolean).map((kv) => [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)]));
  const r = attrs(root);
  return h("svg", { width: r.width, height: r.height, viewBox: r.viewBox, fill: "none", stroke: "currentColor", strokeWidth: 2 }, ...children.map((c, i) => h(c.slice(0, c.indexOf(":")), { key: i, ...attrs(c) })));
};
const LABELS = {
  toolbar: "Diagram", undo: "Undo", redo: "Redo", fit: "Fit", fitAuto: "Fit (Auto)", zoom50: "50%", zoom100: "100%",
  autoLayout: "Auto-layout", autoLayoutHint: "Lay the diagram out again, instantly (sizes fitted to the text, no overlap); content unchanged, undoable",
  format: "Format", formatHint: "Display only: the BPMN model is the same in both formats",
  export: "Export", exportBpmn: "BPMN", exportDrawio: "Drawio", exportSparx: "Sparx",
};
const FORMATS = [
  { id: "custom", label: "Custom", profile: "legend", palette: "legend" },
  { id: "bpmn", label: "BPMN", profile: "colored", palette: "legend", drawing: "classic" },
];
const contract = (extra = {}) => ({
  xml, labels: LABELS, formats: FORMATS, paletteColumns: 2,
  toolbar: { zoomButtons: false, autoLayout: "text", importButton: false },
  menus: { chevron: "text", icons: false },
  icons: { undo: icon(fixture.looks.custom.controls[0].svg), redo: icon(fixture.looks.custom.controls[1].svg) },
  ...extra,
});

async function capture(host, root, props) {
  root.render(h(BpmnWorkshop, props));
  for (let i = 0; i < 100 && !host.querySelector(".djs-palette .entry"); i++) await sleep(30);
  await sleep(150);
  const toolbar = host.querySelector('[role="toolbar"]');
  // Toolbar controls only: menu items (role menuitem…) belong to the open menu, read below.
  const controls = [...toolbar.querySelectorAll('button:not([role^="menuitem"]), [role="group"]')].map((el) => control(el, toolbar));
  const menus = {};
  if (!props.readOnly) {
    for (const trigger of [...toolbar.querySelectorAll("button[aria-haspopup]")]) {
      const name = trigger.getAttribute("aria-label") ?? (trigger.textContent ?? "").trim();
      trigger.click();
      await sleep(60);
      const menu = document.querySelector('[role="menu"]:not([hidden])');
      menus[name] = menu ? menuItems(menu) : null;
      trigger.click();
      await sleep(60);
    }
  }
  const palette = [...host.querySelectorAll(".djs-palette .entry")].map((e) => {
    const action = e.getAttribute("data-action") ?? "";
    return { entry: action.slice(action.indexOf(".") + 1), title: e.getAttribute("title"), classes: (e.getAttribute("class") ?? "").split(/\s+/).filter((c) => c && c !== "entry").sort() };
  });
  const paletteTwoColumns = /\btwo-column\b/.test(host.querySelector(".djs-palette")?.className ?? "");
  return { controls, menus, palette, paletteTwoColumns };
}

window.structure = {
  async run() {
    const out = {};
    const host = document.getElementById("app");
    host.style.cssText = "width:1000px;height:600px;position:relative";
    const root = createRoot(host);
    out.custom = await capture(host, root, contract({ format: "custom" }));
    out.bpmn = await capture(host, root, contract({ format: "bpmn" }));
    out.readOnly = await capture(host, root, contract({ format: "custom", readOnly: true }));
    // No notice after an export whose fidelity is empty (local Draw.io from semantic metadata).
    const downloads = [];
    root.render(h(BpmnWorkshop, contract({ format: "custom", onDownload: (file) => downloads.push(file.filename) })));
    await sleep(200);
    const exportTrigger = [...host.querySelectorAll('[role="toolbar"] button')].find((b) => (b.textContent ?? "").includes("Export"));
    exportTrigger.click();
    await sleep(60);
    [...document.querySelectorAll('[role="menu"]:not([hidden]) [role="menuitem"]')].find((m) => m.textContent.trim() === "Drawio").click();
    await sleep(300);
    out.noticeAfterExport = { downloads, notices: host.querySelectorAll(".bpmn-workshop__notice").length };
    // No colour entry in the palette or the context pad.
    const shape = host.querySelector('.djs-element[data-element-id="Check_order"]');
    shape?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 10, clientY: 10 }));
    shape?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    shape?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await sleep(200);
    out.colourEntries = [...host.querySelectorAll(".djs-palette .entry, .djs-context-pad .entry")].map((e) => `${e.getAttribute("data-action")} ${e.className}`).filter((s) => /colou?r/i.test(s));
    out.contextPadShown = host.querySelectorAll(".djs-context-pad .entry").length > 0;
    // Defaults (no new options): the 0.3 toolbar, except the Sparx label.
    root.render(h(BpmnWorkshop, { xml, formats: FORMATS.map(({ palette, drawing, ...f }) => f) }));
    await sleep(300);
    const tb = host.querySelector('[role="toolbar"]');
    out.defaults = {
      zoom: !!tb.querySelector('[data-testid="bpmn-workshop-zoom-in"]') && !!tb.querySelector('[data-testid="bpmn-workshop-zoom-out"]'),
      import: !!tb.querySelector('[data-testid="bpmn-workshop-import"]'),
      svgChevrons: [...tb.querySelectorAll("button[aria-haspopup]")].every((b) => b.querySelector("svg")),
      autoLayoutIcon: !!tb.querySelector('[data-testid="bpmn-workshop-auto-layout"] svg'),
    };
    const ex = [...tb.querySelectorAll("button[aria-haspopup]")].find((b) => b.getAttribute("aria-label") === "Export");
    ex.click();
    await sleep(60);
    out.defaults.exportItems = [...document.querySelectorAll('[role="menu"]:not([hidden]) [role="menuitem"]')].map((m) => m.textContent.trim());
    ex.click();
    root.unmount();
    return out;
  },
};
window.__ready = true;
