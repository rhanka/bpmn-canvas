// Consumer of the packed package: the complete workshop from the /react subpath.
import { createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BpmnWorkshop } from "@sentropic/bpmn-canvas/react";

const xml = await (await fetch("./corpus/ce5-two-diagrams-shared-root.bpmn")).text();
const el = document.createElement("div");
el.style.cssText = "width:1000px;height:600px";
document.getElementById("app").appendChild(el);
const downloads = [];
createRoot(el).render(createElement(StrictMode, null, createElement(BpmnWorkshop, { xml, onDownload: (f) => downloads.push(f.filename) })));
window.workshopTest = { downloads };
for (let i = 0; i < 200 && !el.querySelector('.bpmn-workshop[data-state="ready"]'); i++) await new Promise((r) => setTimeout(r, 25));
window.__ready = true;
