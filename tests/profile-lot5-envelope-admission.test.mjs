import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { semanticRevision } from "../dist/profile/envelope.js";
import { complete } from "../dist/profile/completion.js";
import { compileByPath } from "./helpers/lot3-compile.mjs";
import { canvasFor, inputsOf } from "./helpers/lot5-runtime.mjs";

const root = new URL("./fixtures/lot5-ui/expectations/", import.meta.url);
const caseRecord = name => JSON.parse(readFileSync(new URL(`cases/${name}`, root)));

function loadCanvas() {
  const c = caseRecord("palette-001-task-programmatic.json");
  return canvasFor(c);
}

function validEnvelope() {
  const snap = JSON.parse(readFileSync(new URL("fixtures/documents/basic.snapshot.json", root)));
  return snap.envelope;
}

function resealed(envelope) {
  const next = structuredClone(envelope);
  next.semanticRevision = semanticRevision(next.tree, next.profileIdentity, next.bindings);
  return next;
}

async function codeFor(mutator) {
  const { canvas } = await loadCanvas();
  const envelope = resealed(mutator(structuredClone(validEnvelope())));
  const result = canvas.setDefinitions({ envelope });
  canvas.dispose();
  return result;
}

test("f13 documentVersion 2 is refused", async () => {
  const result = await codeFor(envelope => {
    envelope.documentVersion = "2";
    return envelope;
  });
  assert.equal(result.status, "refused", "documentVersion 2 must not load");
});

test("f13 unknown envelope member is refused", async () => {
  const result = await codeFor(envelope => {
    envelope.extra = true;
    return envelope;
  });
  assert.equal(result.status, "refused", "unknown envelope member must not load");
});

test("f13 dangling sequenceFlow target is refused", async () => {
  const result = await codeFor(envelope => {
    envelope.tree.rootElements[0].flowElements.find(n => n.$type === "bpmn:SequenceFlow").targetRef = "Nowhere";
    return envelope;
  });
  assert.equal(result.status, "refused", "dangling targetRef must not load");
  assert.equal(result.code, "reference-dangling");
});

test("f13 binding to a missing element is refused", async () => {
  const result = await codeFor(envelope => {
    envelope.bindings = [{ ownerId: "Proc_main", role: "x", targetId: "Missing_1" }];
    return envelope;
  });
  assert.equal(result.status, "refused", "binding to a missing element must not load");
});

test("f13 unknown member on a task is refused", async () => {
  const result = await codeFor(envelope => {
    envelope.tree.rootElements[0].flowElements.find(n => n.$type === "bpmn:Task").colour = "red";
    return envelope;
  });
  assert.equal(result.status, "refused", "unknown member on a task must not load");
});

test("f13 task inside rootElements is refused", async () => {
  const result = await codeFor(envelope => {
    envelope.tree.rootElements.push({ $type: "bpmn:Task", id: "Stray" });
    return envelope;
  });
  assert.equal(result.status, "refused", "task inside rootElements must not load");
});

test("f13 complete refuses a binding to a missing target", async () => {
  const vector = JSON.parse(readFileSync(
    new URL("./fixtures/lot3-cn/expectations/cases/l3-n-imported-supports.json", import.meta.url)));
  const envelope = structuredClone(vector.inputArtifacts.find(a => a.role === "envelope").json);
  const { compiled } = await compileByPath(vector.profileArtifact.path);
  assert.equal(compiled.status, "ok", compiled.code);
  const missing = structuredClone(envelope);
  missing.bindings = missing.bindings.map((binding, i) =>
    (i === 0 ? { ...binding, targetId: "Missing_support" } : binding));
  missing.semanticRevision = semanticRevision(missing.tree, missing.profileIdentity, missing.bindings);
  const result = await complete(compiled.payload, missing, "retained", "qualification");
  assert.equal(result.status, "refused", "complete must not republish a missing binding target");
  assert.equal(result.code, "support-binding-conflict");
});
