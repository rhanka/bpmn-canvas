import { createBpmnCanvas } from "@sentropic/bpmn-canvas";

const violations = [];
document.addEventListener("securitypolicyviolation", (e) => violations.push({ directive: e.violatedDirective, blocked: e.blockedURI, sample: e.sample }));
const nonce = document.querySelector('meta[name="csp-nonce"]').content;
const host = document.createElement("div");
host.style.cssText = "width:700px;height:420px;position:relative";
document.getElementById("app").appendChild(host);
const xml = await (await fetch("./corpus/ce4-two-pools-message.bpmn")).text();
const diagnostics = [];
const handle = createBpmnCanvas(host, { xml, styleNonce: nonce, onDiagnostic: (d) => diagnostics.push(d) });
await handle.ready;
await document.fonts.ready;
window.csp = { handle, violations, diagnostics };
window.__ready = true;
