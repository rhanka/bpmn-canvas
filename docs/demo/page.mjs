// Live demo: one canvas, three looks, switchable without reloading the diagram.
import { createBpmnCanvas } from "../../dist/index.js";
import xml from "./B.1.0.bpmn";
import { DEMO_TOKENS } from "./palette.mjs";

const host = document.getElementById("canvas");
const bar = document.getElementById("looks");
const status = document.getElementById("status");
const handle = createBpmnCanvas(host, { xml, profile: "standard", fitMode: "whole", wheel: "zoom-cursor", legendTokens: DEMO_TOKENS, coloredTokens: DEMO_TOKENS });
const buttons = [...bar.querySelectorAll("button[data-profile]")];
const select = (profile) => {
  for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.profile === profile));
};
for (const b of buttons) {
  b.addEventListener("click", async () => {
    await handle.setProfile(b.dataset.profile, b.dataset.profile === "standard" ? undefined : DEMO_TOKENS);
    select(b.dataset.profile);
  });
}
document.getElementById("layout").addEventListener("click", async () => {
  const r = await handle.autoLayout();
  status.textContent = `Auto-layout: ${r.changed} element(s) moved. Undo with Ctrl+Z.`;
});
handle.ready.then(() => {
  select("standard");
  status.textContent = handle.getDiagnostics().length ? "Loaded (see the console for notes)." : "Loaded.";
});
