import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { JSDOM } from "jsdom";
import { attachNativeProfileUi } from "../dist/profile/lot5-ui.js";
import { createNativeProfileCanvas, createDescriptorContext } from "../dist/profile/index.js";
import { compareCase } from "./fixtures/lot5-ui/expectations/comparators/lot5-compare.mjs";
// Compile and load only the pinned inputs; this helper writes no expectations.
const root = new URL("./fixtures/lot5-ui/expectations/", import.meta.url);
const caseRecord = prefix => JSON.parse(readFileSync(new URL(`cases/${readdirSync(new URL("cases/", root)).find(f => f.includes(prefix))}`, root)));
const { canvasFor, inputsOf, compileFor, twinStep } = await import("./helpers/lot5-runtime.mjs");

test("native DOM palette exposes the sealed profile entries and commits one action", async () => {
  const c = caseRecord("palette-001");
  const { canvas } = await canvasFor(c);
  canvas.loadSnapshot(inputsOf(c).snapshot);
  const dom = new JSDOM("<main></main>");
  const host = dom.window.document.querySelector("main");
  const ui = attachNativeProfileUi(host, canvas);
  try {
    const button = host.querySelector('[data-entry="task-create"]');
    assert.ok(button, "sealed palette entry must be reachable through the DOM");
    const committed = new Promise(resolve => canvas.onChange(resolve));
    button.click();
    const event = await committed;
    assert.equal(event.origin, "command");
    assert.equal(canvas.fullHistory().rootTransactions, 1);
    assert.equal(event.report.operation, "applyCommands");
  } finally { ui.dispose(); dom.window.close(); canvas.dispose(); }
});

test("native DOM adapter replays the sealed neutral demo and final download", async () => {
  const c = caseRecord("demo-001"), inputs = inputsOf(c), build = await compileFor(c);
  const descriptors = readFileSync(new URL("fixtures/ui-neutral-descriptors.json", root));
  const context = createDescriptorContext(build.profile.descriptors.map(pin => ({ ...pin, descriptorBytes: descriptors })));
  assert.equal(context.status, "ok");
  const dom = new JSDOM("<main></main>"), events = [], downloads = [];
  const created = await createNativeProfileCanvas(dom.window.document.querySelector("main"), {
    compiled: build.compiled, descriptorContext: context.payload, metricBytes: build.metricBytes,
    snapshot: inputs.snapshot, onDownload: value => downloads.push(value),
  });
  assert.equal(created.status, "ok", created.code);
  const handle = created.payload;
  handle.onChange(value => events.push(value));
  const steps = [];
  const twinSteps = [];
  try {
    const script = c.commandArtifact.json.steps;
    for (let k = 0; k < script.length; k++) {
      const step = script[k];
      const first = events.length;
      if (step.action === "gesture") {
        const out = await handle.performGesture(structuredClone(step.gesture));
        assert.equal(out.result?.status, "ok", out.result?.code);
        steps.push({ staged: out.staged, snapshot: handle.getSnapshot(), events: events.slice(first) });
        twinSteps.push(twinStep(k + 1, "gesture", out.result, out.events ?? events.slice(first)));
      } else if (step.action === "undo" || step.action === "redo") {
        const current = handle.getSnapshot().payload;
        const result = await handle[step.action]({ expectedRevision: current.envelope.semanticRevision, expectedViewRevision: current.viewRevision });
        steps.push({ result, events: events.slice(first) });
        twinSteps.push(twinStep(k + 1, step.action, result, events.slice(first)));
      } else {
        const out = await handle.export(step.request);
        steps.push({ download: { ...out.download, callbacks: downloads }, events: events.slice(first) });
        assert.match(new TextDecoder().decode(out.download.serialized.payload.bytes), /^<mxfile[ >]/);
      }
    }
    const verdict = compareCase(c, inputs, { steps, twin: { steps: twinSteps } });
    assert.equal(verdict.ok, true, JSON.stringify(verdict.failures));
    assert.equal(downloads.length, 1);
  } finally { await handle.dispose(); dom.window.close(); }
});

test("optional property panel remains UNSEALED", { skip: "OPEN-PANEL: owner selection pending" }, () => {
  assert.fail("OPEN-PANEL must be selected before this case is enabled");
});

test("native downloads refuse a view changed during preparation", async () => {
  const c = caseRecord("workshop-003"), inputs = inputsOf(c), build = await compileFor(c);
  const bytes = readFileSync(new URL("fixtures/ui-neutral-descriptors.json", root));
  const context = createDescriptorContext(build.profile.descriptors.map(pin => ({ ...pin, descriptorBytes: bytes })));
  const dom = new JSDOM("<main></main>"), downloads = [];
  const created = await createNativeProfileCanvas(dom.window.document.querySelector("main"), {
    compiled: build.compiled, descriptorContext: context.payload, metricBytes: build.metricBytes,
    snapshot: inputs.snapshot, onDownload: value => downloads.push(value),
  });
  assert.equal(created.status, "ok", created.code);
  const handle = created.payload;
  try {
    const exporting = handle.export(inputs["format-option"]);
    await handle.setTheme("contrast");
    const result = await exporting;
    assert.equal(downloads.length, 0, "a stale preparation must emit no download callback");
    assert.equal(result.download.prepared.code, "render-stale");
  } finally { await handle.dispose(); dom.window.close(); }
});

for (const prefix of ["presentation-001", "presentation-002", "presentation-003", "presentation-004", "presentation-006"]) {
  test(`native DOM pointer provider matches sealed ${prefix}`, async () => {
    const c = caseRecord(prefix), inputs = inputsOf(c), { canvas } = await canvasFor(c);
    canvas.loadSnapshot(inputs.snapshot);
    const dom = new JSDOM("<main></main>"), events = [];
    const host = dom.window.document.querySelector("main");
    let outcome;
    const ui = attachNativeProfileUi(host, canvas, { onOutcome(value) { outcome = value; },
      gestureContext: () => ({ transactionId: c.commandArtifact.json.transactionId }) });
    canvas.onChange(value => events.push(value));
    const gesture = c.commandArtifact.json;
    const group = host.querySelector(`[data-occurrence="${gesture.occurrence.occurrenceKey}"]`);
    const root = host.querySelector("section");
    try {
      if (gesture.gesture === "bendpoint-add") {
        group.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true, clientX: gesture.point.x / 1000, clientY: gesture.point.y / 1000 }));
      } else {
        const target = gesture.gesture === "resize" ? group.querySelector(`[data-resize="${gesture.edge}"]`)
          : gesture.gesture === "label-move" ? group.querySelector("text") : group.querySelector("rect,ellipse,polygon");
        assert.ok(target, "the native pointer target must exist");
        target.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, clientY: 100 }));
        root.dispatchEvent(new dom.window.MouseEvent("pointermove", { bubbles: true, clientX: 100 + gesture.delta.x / 1000, clientY: 100 + gesture.delta.y / 1000 }));
        if (gesture.cancel) root.dispatchEvent(new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
        else root.dispatchEvent(new dom.window.MouseEvent("pointerup", { bubbles: true, clientX: 100 + gesture.delta.x / 1000, clientY: 100 + gesture.delta.y / 1000 }));
      }
      await new Promise(resolve => setTimeout(resolve, 0));
      const observed = { snapshot: canvas.getSnapshot().result, events: [...events], history: canvas.fullHistory() };
      if (outcome?.outcome) observed.outcome = outcome.outcome;
      const verdict = compareCase(c, inputs, observed);
      assert.equal(verdict.ok, true, JSON.stringify(verdict.failures));
    } finally { ui.dispose(); canvas.dispose(); dom.window.close(); }
  });
}
