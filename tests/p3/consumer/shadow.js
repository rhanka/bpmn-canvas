import { createBpmnCanvas } from "@sentropic/bpmn-canvas";

const hostEl = document.createElement("div");
document.getElementById("app").appendChild(hostEl);
const shadow = hostEl.attachShadow({ mode: "open" });
const inner = document.createElement("div");
inner.style.cssText = "width:700px;height:420px;position:relative";
shadow.appendChild(inner);
const xml = await (await fetch("./corpus/ce4-two-pools-message.bpmn")).text();
const diagnostics = [];
const handle = createBpmnCanvas(inner, { xml, onDiagnostic: (d) => diagnostics.push(d) });
await handle.ready;
await document.fonts.ready;
window.shadowTest = { handle, shadow, diagnostics };
window.__ready = true;
