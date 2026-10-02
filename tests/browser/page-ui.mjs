import { createElement as h, useState } from "react";
import { createRoot } from "react-dom/client";
import { Menu } from "../../dist/react/ui/Menu.js";
import { DiagramTabs } from "../../dist/react/ui/DiagramTabs.js";

window.__log = [];
const log = (s) => window.__log.push(s);

const itemsA = [
  { id: "alpha", label: "Alpha", description: "First item", onSelect: () => log("A:Alpha") },
  { id: "beta", label: "Beta", disabled: true, onSelect: () => log("A:Beta") },
  { id: "charlie", label: "Charlie", onSelect: () => log("A:Charlie") },
  { id: "delta", label: "Delta", onSelect: () => log("A:Delta") },
];

function Radio() {
  const [v, setV] = useState("light");
  return h(Menu, {
    label: "Theme",
    ariaLabel: "Theme menu",
    testId: "menu-b",
    items: [
      { id: "light", label: "Light", checked: v === "light", onSelect: () => { setV("light"); log("B:light"); } },
      { id: "dark", label: "Dark", checked: v === "dark", onSelect: () => { setV("dark"); log("B:dark"); } },
    ],
  });
}

function Tabs({ prefix, ids }) {
  const [active, setActive] = useState(ids[0].id);
  return h(DiagramTabs, {
    tabs: ids,
    activeId: active,
    onSelect: (id) => { setActive(id); log(`${prefix}:select:${id}`); },
    ariaLabel: `Diagrams ${prefix}`,
    panelId: `panel-${prefix}`,
    idPrefix: prefix,
  });
}

const LONG = "A very long diagram name that does not fit in a tab and must be truncated with an ellipsis";

function App() {
  return h("div", { id: "app-root" },
    h("button", { id: "before", type: "button" }, "before"),
    h(Menu, { label: "Actions", ariaLabel: "Actions menu", testId: "menu-a", items: itemsA, title: "Actions" }),
    h(Radio),
    h(Menu, { label: "Off", ariaLabel: "Disabled menu", testId: "menu-c", disabled: true, items: itemsA }),
    h("button", { id: "after", type: "button" }, "after"),
    h("div", { id: "tabs-a" }, h(Tabs, { prefix: "wa", ids: [{ id: "one", label: "One" }, { id: "two", label: "Two" }, { id: "three", label: LONG }] })),
    h("div", { id: "tabs-b" }, h(Tabs, { prefix: "wb", ids: [{ id: "one", label: "X" }, { id: "two", label: "Y" }] })),
    h("div", { id: "tabs-empty" }, h(DiagramTabs, { tabs: [], activeId: undefined, onSelect: () => {}, ariaLabel: "Empty", panelId: "panel-empty", idPrefix: "we" })),
    h("div", { id: "panel-wa", role: "tabpanel", tabIndex: 0, "aria-label": "Panel A" }, "panel a"),
    h("div", { id: "panel-wb", role: "tabpanel", tabIndex: 0, "aria-label": "Panel B" }, "panel b"),
    h("div", { id: "panel-empty", role: "tabpanel", "aria-label": "Panel empty", hidden: true }),
    h("div", { id: "edge", style: { position: "fixed", right: 0, top: 260 } },
      h(Menu, { label: "Edge", ariaLabel: "Edge menu", testId: "menu-e", items: [
        { id: "e1", label: "A rather long label that makes this popup wide", description: "And a description that adds even more text to the popup width", onSelect: () => log("E:1") },
        { id: "e2", label: "Short", onSelect: () => log("E:2") },
      ] })),
    h("div", { id: "plain-area", style: { height: 40, marginTop: 8 } }, "plain area"),
  );
}

createRoot(document.getElementById("app")).render(h(App));

// A menu inside a shadow root.
const host = document.createElement("div");
host.id = "shadow-host";
document.body.appendChild(host);
const shadow = host.attachShadow({ mode: "open" });
const mount = document.createElement("div");
const out = document.createElement("button");
out.id = "shadow-outside";
out.type = "button";
out.textContent = "outside in shadow";
shadow.append(mount, out);
createRoot(mount).render(h(Menu, { label: "Shadow", ariaLabel: "Shadow menu", testId: "menu-s", items: [
  { id: "s1", label: "One", onSelect: () => log("S:One") },
  { id: "s2", label: "Two", onSelect: () => log("S:Two") },
] }));

setTimeout(() => { window.__ready = true; }, 300);
