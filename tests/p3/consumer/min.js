// Single import from the packed package. Mounts two instances from synthetic corpus files.
import { createBpmnCanvas } from "@sentropic/bpmn-canvas";

const app = document.getElementById("app");
const load = (name) => fetch(`./corpus/${name}.bpmn`).then((r) => r.text());
const host = () => {
  const el = document.createElement("div");
  el.style.cssText = "width:640px;height:380px;margin:8px;position:relative";
  app.appendChild(el);
  return el;
};
const diagnostics = [];
const [a, b] = await Promise.all([load("ce4-two-pools-message"), load("ce1-homonyms")]);
const handles = [a, b].map((xml) => createBpmnCanvas(host(), { xml, onDiagnostic: (d) => diagnostics.push(d) }));
await Promise.all(handles.map((h) => h.ready));
window.__min = { handles, diagnostics };
window.__ready = true;
