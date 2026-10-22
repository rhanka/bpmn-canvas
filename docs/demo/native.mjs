import data from "neutral-demo-inputs";
import recommended from "bpmnlint/config/recommended.js";
import { loadProfile, compileProfile, createDescriptorContext, createNativeProfileCanvas } from "../../dist/profile/index.js";

const encode = text => new TextEncoder().encode(text);
const profile = JSON.parse(data.profileText);
const registry = { ...data.registry, descriptors: JSON.parse(data.descriptorText).types,
  lintConfigs: { "bpmnlint:recommended": recommended } };
const loaded = loadProfile(encode(data.profileText), {
  schemaBytes: encode(data.schemaText), baseBytes: encode(data.baseText), basePin: { ...profile.base, digestDomain: "raw" },
  descriptorPins: profile.descriptors.map(pin => ({ ...pin, digestDomain: "raw", descriptorBytes: encode(data.descriptorText) })),
  compilerRuleTable: data.registry.compilerRuleTable,
  capabilities: { capabilities: registry.capabilities, signatures: registry.signatures },
  assetBag: new Map(profile.resources.map(r => [r.assetKey, encode(data.metricsText)])),
});
const compiled = loaded.status === "ok" ? compileProfile(loaded.payload, registry) : loaded;
const context = createDescriptorContext(profile.descriptors.map(pin => ({ ...pin, descriptorBytes: encode(data.descriptorText) })));
const labels = ["Create a task", "Edit its label", "Replace with a user task; record the new ID", "Connect the start", "Connect the end",
  "Create a reference and its store", "Edit the store title", "Link the reference with an Association", "Edit the task property", "Undo", "Redo", "Export the final drawing"];
const next = document.querySelector("#next"), reset = document.querySelector("#reset"), status = document.querySelector("#status");
const progress = document.querySelector("#progress"), details = document.querySelector("#details"), link = document.querySelector("#download");
const list = document.querySelector("#steps");
for (const label of labels) { const li = document.createElement("li"); li.textContent = label; list.append(li); }
let handle, cursor = 0, url;
const requireOk = value => { if (value.status !== "ok") throw new Error(value.code); return value.payload; };
async function initialize() {
  next.disabled = reset.disabled = true;
  if (handle) await handle.dispose();
  if (url) URL.revokeObjectURL(url);
  link.hidden = true; cursor = 0; progress.value = 0;
  try {
    handle = requireOk(await createNativeProfileCanvas(document.querySelector("#canvas"), {
      compiled: requireOk(compiled), descriptorContext: requireOk(context), snapshot: structuredClone(data.snapshot),
      metricBytes: new Map(profile.resources.map(r => [r.id, encode(data.metricsText)])),
      onDownload(download) {
        url = URL.createObjectURL(new Blob([download.bytes], { type: "application/xml" }));
        link.href = url; link.download = "neutral-drawing.drawio"; link.hidden = false;
      },
    }));
    status.textContent = "Ready. Run the first step."; next.disabled = reset.disabled = false;
    details.textContent = "";
    for (const li of list.children) li.removeAttribute("aria-current");
  } catch (error) { status.textContent = `Cannot start: ${error.message}`; }
}
next.addEventListener("click", async () => {
  next.disabled = true; reset.disabled = true;
  const step = data.steps[cursor];
  try {
    let observed;
    if (step.action === "gesture") {
      observed = await handle.performGesture(structuredClone(step.gesture));
      requireOk(observed.result);
    } else if (step.action === "undo" || step.action === "redo") {
      const current = requireOk(handle.getSnapshot());
      observed = await handle[step.action]({ expectedRevision: current.envelope.semanticRevision, expectedViewRevision: current.viewRevision });
      requireOk(observed);
    } else {
      observed = await handle.export(step.request);
      requireOk(observed.download.prepared); requireOk(observed.download.serialized);
    }
    list.children[cursor]?.setAttribute("aria-current", "step");
    cursor++; progress.value = cursor;
    status.textContent = `${cursor} of ${data.steps.length}: ${labels[cursor - 1]} completed.`;
    const result = observed.result ?? observed;
    details.textContent = JSON.stringify({ status: result.status ?? "ok", replacementTable: result.report?.idMap ?? [],
      semanticRevision: requireOk(handle.getSnapshot()).envelope.semanticRevision }, null, 2);
    next.disabled = cursor === data.steps.length;
  } catch (error) { status.textContent = `Step ${cursor + 1} refused: ${error.message}`; }
  reset.disabled = false;
});
reset.addEventListener("click", initialize);
await initialize();
