import { StrictMode, createElement } from "react";
import { createRoot } from "react-dom/client";
import { BpmnCanvas } from "@sentropic/bpmn-canvas/react";

const xml = await (await fetch("./corpus/ce1-homonyms.bpmn")).text();
const el = document.createElement("div");
el.style.cssText = "width:700px;height:420px";
document.getElementById("app").appendChild(el);
const root = createRoot(el);
window.reactTest = {
  async cycles(n) {
    for (let i = 0; i < n; i++) {
      root.render(createElement(StrictMode, null, createElement(BpmnCanvas, { xml })));
      await new Promise((r) => setTimeout(r, 0));
      root.render(null);
      await new Promise((r) => setTimeout(r, 0));
    }
    root.render(createElement(StrictMode, null, createElement(BpmnCanvas, { xml })));
    await new Promise((r) => setTimeout(r, 800));
    return { containers: el.querySelectorAll(".djs-container").length, badges: el.querySelectorAll(".bjs-powered-by").length };
  },
};
window.__ready = true;
