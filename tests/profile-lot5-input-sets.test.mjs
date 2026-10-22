import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canvasFor } from "./helpers/lot5-runtime.mjs";

const root = new URL("./fixtures/lot5-ui/expectations/", import.meta.url);
const caseRecord = name => JSON.parse(readFileSync(new URL(`cases/${name}`, root)));

test("f30 creating a loose input on a process without sets succeeds with a default set", async () => {
  const c = caseRecord("palette-001-task-programmatic.json");
  const { canvas } = await canvasFor(c);
  const snap = JSON.parse(readFileSync(new URL("fixtures/documents/basic.snapshot.json", root)));
  canvas.loadSnapshot(structuredClone(snap));
  const revision = canvas.currentRevision;
  const viewRevision = canvas.stateViewRevision();
  const out = await canvas.applyCommands({ baseRevision: revision, expectedViewRevision: viewRevision,
    transactionId: "tx-loose-input", commands: [{ command: "surface", entry: "input-loose-create",
      context: { owner: "Proc-review", key: "k-loose", value: "Loose input" } }] });
  assert.equal(out.result.status, "ok", out.result.code);
  const envelope = out.result.payload.envelope;
  const owner = envelope.tree.rootElements.find(r => r.id === "Proc-review");
  const created = (owner.ioSpecification?.dataInputs ?? []).find(n => n.$type === "bpmn:DataInput");
  assert.ok(created, "the loose DataInput must be created");
  const sets = owner.ioSpecification?.inputSets ?? [];
  assert.ok(sets.length >= 1, "C/N must create the deterministic default input set (DESIGN L547)");
  canvas.dispose();
});
