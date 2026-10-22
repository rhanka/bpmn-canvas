/** Fix round 6, J6b: entryFor must return a refused listEntries query refusal
 * instead of undefined, and every implicit caller (context-pad delete,
 * Delete/Backspace, paste, cut) must propagate the original code instead of
 * substituting profile-producer. One refusal case per caller, plus a control
 * locking the successful-empty behaviour. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadProfile } from "../dist/profile/compiler.js";
import { compileProfile as compilePublic } from "../dist/profile/public-compiler.js";
import { loadUnicodeCaseTable } from "../dist/profile/unicode-case.js";
import { Lot5Canvas } from "../dist/profile/lot5-canvas.js";
import { TreeIndex } from "../dist/profile/lot5-support.js";
import { evalPredicateResult, subjectScope } from "../dist/profile/lot5-eval.js";
import { semanticRevision } from "../dist/profile/envelope.js";
import { vendoredUnicodeCaseDocument } from "./helpers/unicode-case-vendored.mjs";
import { compilerRegistry as uiRegistryFn, ruleTable as uiRuleTable, schemaBytes as uiSchemaBytes } from "./helpers/compiler-fixture.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");
const uiDir = join(fixtures, "lot5-ui/expectations");
const uiRead = p => readFileSync(join(uiDir, p));
const UNICODE_CASE = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;

// Same refusing shape as the acceptance probe: not(any(false, bad)) keeps a
// nested evaluator refusal instead of a boolean.
const bad = { op: "present",
  value: { op: "concat", values: [{ op: "literal", value: "v:" }, { op: "read", binding: "self", path: "/name" }] } };
const nested = () => ({ op: "not", arg: { op: "any", args: [{ op: "false" }, structuredClone(bad)] } });

async function witnessCanvas(mutateProfile) {
  const uiRegistry = uiRegistryFn();
  const profile = JSON.parse(uiRead("fixtures/ui-neutral-profile.json").toString("utf8"));
  mutateProfile(profile);
  const loaded = await loadProfile(JSON.stringify(profile), {
    schemaBytes: uiSchemaBytes,
    baseBytes: uiRead("fixtures/ui-neutral-base.json"),
    basePin: { ...profile.base, digestDomain: "raw" },
    descriptorPins: profile.descriptors.map(p => ({ ...p, digestDomain: "raw", descriptorBytes: uiRead("fixtures/ui-neutral-descriptors.json") })),
    compilerRuleTable: uiRuleTable,
    capabilities: { capabilities: uiRegistry.capabilities, signatures: uiRegistry.signatures },
    assetBag: new Map([["ui-neutral-metrics.json", uiRead("fixtures/ui-neutral-metrics.json")]]),
  });
  assert.equal(loaded.status, "ok", "witness profile loads");
  const descriptors = JSON.parse(uiRead("fixtures/ui-neutral-descriptors.json").toString("utf8")).types;
  const compiled = await compilePublic(loaded.payload, { ...uiRegistry, descriptors });
  assert.equal(compiled.status, "ok", "witness profile compiles");
  const metrics = profile.resources.find(r => r.kind === "metrics");
  const canvas = new Lot5Canvas({
    compiled: compiled.payload, profileDocument: profile, descriptorTypes: descriptors,
    metricsId: "ui-neutral-metrics", metricsSha256: metrics.sha256, unicodeCase: UNICODE_CASE,
    metricBytes: new Map([[metrics.id, uiRead("fixtures/ui-neutral-metrics.json")]]),
  });
  const snap = JSON.parse(uiRead("fixtures/documents/basic.snapshot.json"));
  const identity = compiled.payload.identity;
  snap.envelope.profileIdentity = identity;
  snap.envelope.semanticRevision = semanticRevision(snap.envelope.tree, identity, snap.envelope.bindings);
  canvas.loadSnapshot(snap);
  // Drop every stored label so the refusing read cannot match.
  const dropped = canvas.getSnapshot().result.payload;
  const walk = v => { if (!v || typeof v !== "object") return; delete v.name; for (const child of Object.values(v)) walk(child); };
  walk(dropped.envelope.tree);
  dropped.envelope.semanticRevision = semanticRevision(dropped.envelope.tree, dropped.envelope.profileIdentity, dropped.envelope.bindings);
  canvas.loadSnapshot(dropped);
  return { canvas };
}

function original(view, tree, id) {
  const scope = subjectScope(view, tree, new TreeIndex(tree), id);
  const result = evalPredicateResult(view, nested(), scope);
  assert.equal(result.status, "refused");
  return result.code;
}

function geometryOf(canvas) {
  const snap = canvas.getSnapshot().result.payload;
  const geometry = snap.presentation.layout.geometry;
  const target = geometry.find(g => g.semanticId === "Task_A") ?? geometry.find(g => g.semanticId && g.bounds);
  return { snapshot: snap, target };
}

function ownerOf(tree) {
  return tree.rootElements.find(n => n.$type === "bpmn:Process").id;
}

async function refusalCanvas() {
  const { canvas } = await witnessCanvas(p => {
    for (const entry of p.ui.filter(e => e.surface === "delete" || e.surface === "paste")) entry.when = nested();
  });
  return canvas;
}

for (const action of ["context-delete", "Delete", "Backspace", "Ctrl+X", "Ctrl+V"]) {
  test(`J6b implicit entry ${action} refusal keeps the query code`, async () => {
    const canvas = await refusalCanvas();
    try {
      const { snapshot, target } = geometryOf(canvas);
      const tree = snapshot.envelope.tree;
      const owner = ownerOf(tree);
      const surface = action === "Ctrl+V" ? "paste" : "delete";
      const subject = action === "Ctrl+V" ? owner : target.semanticId;
      const expected = original(canvas.profileView, tree, subject);
      assert.notEqual(expected, "profile-producer");
      const listed = canvas.listEntries({ baseRevision: canvas.currentRevision, surface, subject, locale: "en" });
      assert.equal(listed.status, "refused");
      assert.equal(listed.code, expected);
      const entry = canvas.profileView.entries.find(e => e.surface === surface);
      const copied = canvas.copy({ baseRevision: canvas.currentRevision, elementIds: [target.semanticId] });
      assert.equal(copied.status, "ok");
      const command = { command: "surface", entry: entry.id,
        context: surface === "paste" ? { owner, key: "witness-paste" } : { target: target.semanticId },
        ...(surface === "paste" ? { fragment: copied.payload } : {}) };
      const applied = await canvas.applyCommands({ baseRevision: canvas.currentRevision,
        expectedViewRevision: canvas.stateViewRevision(), transactionId: "witness-control", commands: [command] });
      assert.equal(applied.result.status, "refused");
      assert.equal(applied.result.code, expected);
      assert.deepEqual(applied.events, []);
      const before = canvas.getSnapshot();
      const selection = [{ pageId: target.pageId, occurrenceKey: target.occurrenceKey }];
      const gesture = action === "context-delete" ? { gesture: "context-pad", action: "delete", element: target.semanticId }
        : { gesture: "keyboard", key: action, selection, container: owner, insertionKey: "witness-paste", fragment: copied.payload };
      const out = await canvas.gesture(gesture);
      assert.equal(out.staged, undefined);
      assert.equal(out.outcome.code, expected);
      assert.deepEqual(canvas.getSnapshot(), before);
    } finally { canvas.dispose(); }
  });
}

test("J6b successful empty entry query still denies with profile-producer", async () => {
  const { canvas } = await witnessCanvas(p => {
    for (const entry of p.ui.filter(e => e.surface === "delete")) entry.when = { op: "false" };
  });
  try {
    const { target } = geometryOf(canvas);
    const listed = canvas.listEntries({ baseRevision: canvas.currentRevision,
      surface: "delete", subject: target.semanticId, locale: "en" });
    assert.equal(listed.status, "ok");
    assert.deepEqual(listed.payload.groups, []);
    const before = canvas.getSnapshot();
    const out = await canvas.gesture({ gesture: "context-pad", action: "delete", element: target.semanticId });
    assert.equal(out.staged, undefined);
    assert.equal(out.outcome.code, "profile-producer");
    assert.deepEqual(canvas.getSnapshot(), before);
  } finally { canvas.dispose(); }
});
