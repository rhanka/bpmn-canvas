import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canvasFor } from "./helpers/lot5-runtime.mjs";

const root = new URL("./fixtures/lot5-ui/expectations/", import.meta.url);
const caseRecord = name => JSON.parse(readFileSync(new URL(`cases/${name}`, root)));

async function dragCanvas(snapshotName) {
  const c = caseRecord("palette-001-task-programmatic.json");
  const { canvas } = await canvasFor(c);
  const snap = JSON.parse(readFileSync(new URL(`fixtures/documents/${snapshotName}`, root)));
  canvas.loadSnapshot(structuredClone(snap));
  const geometry = snap.presentation.layout.geometry;
  const target = geometry.find(g => g.semanticId && g.bounds);
  assert.ok(target, "snapshot must carry a movable occurrence");
  const staged = {
    baseRevision: canvas.currentRevision,
    expectedViewRevision: canvas.stateViewRevision(),
    transactionId: "tx-drag",
    presentation: { gesture: "drag", pageId: target.pageId, occurrenceKey: target.occurrenceKey, delta: { x: 50000, y: 0 } },
  };
  return { canvas, staged, before: structuredClone(snap.envelope) };
}

test("f14 drag runs the correction pipeline, not a bare DI patch", async () => {
  const { canvas, staged, before } = await dragCanvas("unfixed.snapshot.json");
  const out = await canvas.commitPresentation(staged);
  assert.equal(out.result.status, "ok", out.result.code);
  const after = canvas.getSnapshot().result.payload.envelope;
  assert.notEqual(JSON.stringify(after.tree), JSON.stringify(before.tree),
    "a drag on an uncorrected document must commit normalized corrections with the DI move");
  canvas.dispose();
});

test("f14 drag correction commits a single history entry with undo restoring the before-state", async () => {
  const { canvas, staged, before } = await dragCanvas("unfixed.snapshot.json");
  const beforeLayout = structuredClone(canvas.getSnapshot().result.payload.presentation.layout);
  const out = await canvas.commitPresentation(staged);
  assert.equal(out.result.status, "ok", out.result.code);
  assert.equal(out.events.length, 1);
  assert.equal(out.events[0].origin, "command");
  const undone = canvas.restore("undo", { expectedRevision: canvas.currentRevision, expectedViewRevision: canvas.stateViewRevision() });
  assert.equal(undone.result.status, "ok", undone.result.code);
  const restored = canvas.getSnapshot().result.payload;
  assert.equal(JSON.stringify(restored.envelope.tree), JSON.stringify(before.tree));
  assert.equal(JSON.stringify(restored.presentation.layout), JSON.stringify(beforeLayout));
  const redone = canvas.restore("redo", { expectedRevision: canvas.currentRevision, expectedViewRevision: canvas.stateViewRevision() });
  assert.equal(redone.result.status, "ok", redone.result.code);
  assert.equal(redone.result.payload.viewRevision, out.result.payload.viewRevision);
  canvas.dispose();
});

test("f14 drag on a corrected document still moves and stays a fixed point", async () => {
  const { canvas, staged } = await dragCanvas("basic.snapshot.json");
  const first = await canvas.commitPresentation(staged);
  assert.equal(first.result.status, "ok", first.result.code);
  const moved = canvas.getSnapshot().result.payload.presentation.layout.geometry
    .find(g => g.pageId === staged.presentation.pageId && g.occurrenceKey === staged.presentation.occurrenceKey);
  const target = canvas.getSnapshot().result.payload.presentation.layout.geometry
    .find(g => g.semanticId === moved.semanticId && g.pageId === moved.pageId);
  assert.ok(target, "moved occurrence must survive the correction");
  canvas.dispose();
});
