import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canvasFor } from "./helpers/lot5-runtime.mjs";

const root = new URL("./fixtures/lot5-ui/expectations/", import.meta.url);
const caseRecord = name => JSON.parse(readFileSync(new URL(`cases/${name}`, root)));

test("f31 a lone xml is not an input conflict", async () => {
  const c = caseRecord("palette-001-task-programmatic.json");
  const { canvas } = await canvasFor(c);
  const result = canvas.setDefinitions({ xml: "<definitions/>" });
  assert.equal(result.status, "refused");
  assert.notEqual(result.code, "input-conflict", "a single xml input conflicts with nothing");
  canvas.dispose();
});

test("f31 both envelope and xml remain an input conflict", async () => {
  const c = caseRecord("palette-001-task-programmatic.json");
  const { canvas } = await canvasFor(c);
  const snap = JSON.parse(readFileSync(new URL("fixtures/documents/basic.snapshot.json", root)));
  const result = canvas.setDefinitions({ envelope: structuredClone(snap.envelope), xml: "<definitions/>" });
  assert.equal(result.status, "refused");
  assert.equal(result.code, "input-conflict");
  canvas.dispose();
});

test("f31 autosave with an unknown label reports format unsupported", async () => {
  const c = caseRecord("palette-001-task-programmatic.json");
  const { canvas } = await canvasFor(c);
  const snap = JSON.parse(readFileSync(new URL("fixtures/documents/basic.snapshot.json", root)));
  canvas.loadSnapshot(structuredClone(snap));
  const result = await canvas.workshopAutosave({ format: "drawio", label: "Missing label", theme: "plain" });
  assert.equal(result.status, "refused");
  assert.equal(result.code, "export-format-unsupported");
  canvas.dispose();
});

test("f31 autosave without a loaded document reports document-not-loaded", async () => {
  const c = caseRecord("palette-001-task-programmatic.json");
  const { canvas } = await canvasFor(c);
  const result = await canvas.workshopAutosave({ format: "drawio", label: "Drawing", theme: "plain" });
  assert.equal(result.status, "refused");
  assert.equal(result.code, "document-not-loaded");
  canvas.dispose();
});
