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

test("tx provenance: C entries on same-transaction created elements carry generated source and result", async () => {
  const canvas = await canvasForTx();
  const sealed = JSON.parse(readFileSync(new URL("./fixtures/lot3-cn/expectations/cases/l3-tx-batch-one-entry.json", import.meta.url)));
  const envelope = sealed.commandArtifact.json.steps.find((s) => s.call === "setDefinitions").envelope;
  const loaded = canvas.setDefinitions({ envelope: structuredClone(envelope) });
  assert.equal(loaded.status, "ok");
  const snap = await canvas.getSnapshot();
  assert.equal(snap.result.status, "ok");
  const out = await canvas.applyCommands({ baseRevision: canvas.currentRevision,
    expectedViewRevision: snap.result.payload.viewRevision, transactionId: "tx-batch",
    commands: [
      { command: "surface", entry: "task-create", context: { owner: "Process_T", key: "a", value: "First" } },
      { command: "surface", entry: "task-create", context: { owner: "Process_T", key: "b", value: "Second" } },
    ] });
  assert.equal(out.result.status, "ok", JSON.stringify(out.result.code ?? null));
  const entries = out.result.report.entries;
  const corrected = entries.filter((e) => e.disposition === "corrected");
  assert.equal(corrected.length, 4, `batch creates 4 topology writes, got ${corrected.length}`);
  for (const entry of corrected) {
    assert.deepEqual(entry.source, { domain: "none", pointer: null, targetId: null, provenance: "generated" });
    assert.equal(entry.result.provenance, "generated");
    assert.equal(entry.result.domain, "tree");
  }
  canvas.dispose();
});
