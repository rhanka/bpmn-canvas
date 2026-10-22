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

test("io-set-selection-required comes from the C recipe with two sets; one set succeeds", async () => {
  const sealed = JSON.parse(readFileSync(new URL("./fixtures/lot3-cn/expectations/cases/l3-tx-io-set-selection-required.json", import.meta.url)));
  const twoSets = sealed.commandArtifact.json.steps.find((s) => s.step === 2).envelope;
  const oneSet = sealed.commandArtifact.json.steps.find((s) => s.step === 5).envelope;
  const unassigned = { command: "surface", entry: "input-create-unassigned", context: { owner: "Process_T", key: "c", value: "C" } };
  const canvas = await canvasForTx();
  canvas.setDefinitions({ envelope: structuredClone(twoSets) });
  const snap = await canvas.getSnapshot();
  const refused = await canvas.applyCommands({ baseRevision: canvas.currentRevision,
    expectedViewRevision: snap.result.payload.viewRevision, transactionId: "tx-input", commands: [structuredClone(unassigned)] });
  assert.equal(refused.result.status, "refused");
  assert.equal(refused.result.code, "io-set-selection-required");
  assert.deepEqual(refused.result.diagnostics ?? [], []);
  assert.deepEqual(refused.result.report.entries ?? [], []);
  assert.equal(refused.events.length, 0);
  const canvas1 = await canvasForTx();
  canvas1.setDefinitions({ envelope: structuredClone(oneSet) });
  const snap1 = await canvas1.getSnapshot();
  const ok = await canvas1.applyCommands({ baseRevision: canvas1.currentRevision,
    expectedViewRevision: snap1.result.payload.viewRevision, transactionId: "tx-input-single", commands: [structuredClone(unassigned)] });
  assert.equal(ok.result.status, "ok", JSON.stringify(ok.result.code ?? null));
  const sets = ok.result.payload.envelope.tree.rootElements[0].ioSpecification.inputSets;
  assert.equal(sets.length, 1);
  assert.equal(sets[0].id, "InputSet_1");
  assert.ok(sets[0].dataInputRefs.length === 3, "single set gains the new input");
  canvas.dispose();
  canvas1.dispose();
});
