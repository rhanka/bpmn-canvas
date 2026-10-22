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
  return { canvas, profile };
}

function envelopeOf() {
  const sealed = JSON.parse(readFileSync(new URL("./fixtures/lot3-cn/expectations/cases/l3-tx-batch-one-entry.json", import.meta.url)));
  return sealed.commandArtifact.json.steps.find((s) => s.call === "setDefinitions").envelope;
}

test("tx hook is called at staging and applying through the test construction path", async () => {
  const { canvas } = await canvasForTx();
  assert.equal(typeof canvas.setTestTransactionHook, "function", "canvas exposes a test-only transaction hook setter");
  canvas.setDefinitions({ envelope: structuredClone(envelopeOf()) });
  const seen = [];
  canvas.setTestTransactionHook((phase) => { seen.push(phase); });
  const snap = await canvas.getSnapshot();
  const out = await canvas.applyCommands({ baseRevision: canvas.currentRevision,
    expectedViewRevision: snap.result.payload.viewRevision, transactionId: "tx-hook",
    commands: [{ command: "surface", entry: "task-create", context: { owner: "Process_T", key: "a", value: "First" } }] });
  assert.equal(out.result.status, "ok");
  assert.deepEqual(seen, ["staging", "applying"]);
  canvas.dispose();
});

test("tx hook reenter refuses transaction-reentrant and reenter-and-throw keeps lint findings", async () => {
  const { canvas } = await canvasForTx();
  canvas.setDefinitions({ envelope: structuredClone(envelopeOf()) });
  const snap = await canvas.getSnapshot();
  const base = canvas.currentRevision;
  const view = snap.result.payload.viewRevision;
  let nested = null;
  canvas.setTestTransactionHook(async (phase) => {
    if (phase === "applying") {
      nested = await canvas.applyCommands({ baseRevision: base, expectedViewRevision: view,
        transactionId: "tx-nested", commands: [{ command: "surface", entry: "task-create", context: { owner: "Process_T", key: "b", value: "Second" } }] });
    }
  });
  const ok = await canvas.applyCommands({ baseRevision: base, expectedViewRevision: view, transactionId: "tx-a",
    commands: [{ command: "surface", entry: "task-create", context: { owner: "Process_T", key: "a", value: "First" } }] });
  assert.equal(ok.result.status, "ok");
  assert.equal(nested?.result.status, "refused");
  assert.equal(nested?.result.code, "transaction-reentrant");
  assert.deepEqual(nested?.result.report.entries ?? nested?.result.diagnostics ?? [], []);
  const canvas2 = (await canvasForTx()).canvas;
  canvas2.setDefinitions({ envelope: structuredClone(envelopeOf()) });
  const snap2 = await canvas2.getSnapshot();
  const base2 = canvas2.currentRevision;
  const view2 = snap2.result.payload.viewRevision;
  let nested2 = null;
  canvas2.setTestTransactionHook(async (phase) => {
    if (phase === "applying") {
      nested2 = await canvas2.applyCommands({ baseRevision: base2, expectedViewRevision: view2,
        transactionId: "tx-probe", commands: [{ command: "surface", entry: "task-create", context: { owner: "Process_T", key: "b", value: "Second" } }] });
      throw new Error("inject-throw");
    }
  });
  const failed = await canvas2.applyCommands({ baseRevision: base2, expectedViewRevision: view2, transactionId: "tx-fail",
    commands: [{ command: "surface", entry: "task-create", context: { owner: "Process_T", key: "a", value: "First" } }] });
  assert.equal(failed.result.status, "refused");
  assert.equal(failed.result.code, "operation-error");
  assert.equal(nested2?.result.code, "transaction-reentrant");
  assert.ok((failed.result.diagnostics ?? []).length === 4, `hook-throw keeps 4 lint findings, got ${(failed.result.diagnostics ?? []).length}`);
  assert.deepEqual(failed.result.report.entries, failed.result.diagnostics);
  assert.equal(failed.events.length, 0);
  const retrySnap = await canvas2.getSnapshot();
  const retry = await canvas2.applyCommands({ baseRevision: canvas2.currentRevision,
    expectedViewRevision: retrySnap.result.payload.viewRevision, transactionId: "tx-retry",
    commands: [{ command: "surface", entry: "task-create", context: { owner: "Process_T", key: "a", value: "First" } }] });
  canvas2.setTestTransactionHook(null);
  const retry2 = await canvas2.applyCommands({ baseRevision: canvas2.currentRevision,
    expectedViewRevision: (await canvas2.getSnapshot()).result.payload.viewRevision, transactionId: "tx-retry",
    commands: [{ command: "surface", entry: "task-create", context: { owner: "Process_T", key: "a", value: "First" } }] });
  assert.equal(retry2.result.status, "ok", "guard returns to idle so the retry succeeds");
  canvas.dispose();
  canvas2.dispose();
});
