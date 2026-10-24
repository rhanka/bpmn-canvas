import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { compileByPath } from "./helpers/lot3-compile.mjs";
import { Lot5Canvas } from "../dist/profile/lot5-canvas.js";
import { loadUnicodeCaseTable } from "../dist/profile/unicode-case.js";
import { vendoredUnicodeCaseDocument } from "./helpers/unicode-case-vendored.mjs";

const UNICODE_CASE = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;

async function canvasForTx() {
  const { compiled } = await compileByPath("lot3-cn/expectations/profile/neutral-cn.json");
  assert.equal(compiled.status, "ok");
  const profile = JSON.parse(readFileSync(new URL("./fixtures/lot3-cn/expectations/profile/neutral-cn.json", import.meta.url)));
  const descriptors = JSON.parse(readFileSync(new URL("./fixtures/lot3-cn/expectations/profile/neutral-cn-descriptors.json", import.meta.url))).types;
  const metricsBytes = readFileSync(new URL("./fixtures/profile-parity-corpus/profile-mechanism/1/neutral-metrics.json", import.meta.url));
  const metricsSha256 = createHash("sha256").update(metricsBytes).digest("hex");
  const canvas = new Lot5Canvas({ compiled: compiled.payload, profileDocument: profile,
    descriptorTypes: descriptors, metricsId: "neutral-metrics", metricsSha256,
    metricsPins: [{ id: "neutral-metrics", sha256: metricsSha256 }],
    unicodeCase: UNICODE_CASE, metricBytes: new Map([["neutral-metrics", metricsBytes]]) });
  canvas.setDescriptorPins(profile.descriptors ?? []);
  return canvas;
}

test("tx events carry the result report bytes and snapshots stay Layout/1", async () => {
  const canvas = await canvasForTx();
  const sealed = JSON.parse(readFileSync(new URL("./fixtures/lot3-cn/expectations/cases/l3-tx-batch-one-entry.json", import.meta.url)));
  const envelope = sealed.commandArtifact.json.steps.find((s) => s.call === "setDefinitions").envelope;
  const sub = canvas.onChange("L1");
  assert.equal(sub.status, "ok");
  const loaded = canvas.setDefinitions({ envelope: structuredClone(envelope) });
  assert.equal(loaded.status, "ok");
  let events = canvas.readEvents("L1");
  assert.equal(events.length, 1);
  assert.equal(events[0].origin, "load");
  assert.deepEqual(events[0].report, loaded.report);
  const snap = await canvas.getSnapshot();
  assert.equal(snap.result.status, "ok");
  assert.equal(snap.result.payload.presentation.layout.layoutVersion, "1");
  assert.ok(Array.isArray(snap.result.payload.presentation.layout.pages));
  assert.ok(Array.isArray(snap.result.payload.presentation.layout.geometry));
  const out = await canvas.applyCommands({ baseRevision: canvas.currentRevision,
    expectedViewRevision: snap.result.payload.viewRevision, transactionId: "tx-batch",
    commands: [{ command: "surface", entry: "task-create", context: { owner: "Process_T", key: "a", value: "First" } }] });
  assert.equal(out.result.status, "ok");
  assert.equal(out.events.length, 1);
  assert.equal(out.events[0].origin, "command");
  assert.deepEqual(out.events[0].report, out.result.report);
  events = canvas.readEvents("L1");
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].report, out.result.report);
  const snap2 = await canvas.getSnapshot();
  assert.equal(snap2.result.payload.presentation.layout.layoutVersion, "1");
  const undo = canvas.restore("undo", { expectedRevision: canvas.currentRevision, expectedViewRevision: snap2.result.payload.viewRevision });
  assert.equal(undo.result.status, "ok");
  assert.equal(undo.events.length, 1);
  assert.deepEqual(undo.events[0].report, undo.result.report);
  const redo = canvas.restore("redo", { expectedRevision: canvas.currentRevision, expectedViewRevision: canvas.stateViewRevision() });
  assert.equal(redo.result.status, "ok");
  assert.deepEqual(redo.events[0].report, redo.result.report);
  canvas.dispose();
});
