/** Fix round 5, J6: predicate errors outside notion recognition must propagate
 * the evaluator's original code through surface/upstream/field commands and
 * connect/direct-edit gestures, instead of becoming a producer denial or a
 * boolean disallow. One refusal case per predicate site. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadProfile } from "../dist/profile/compiler.js";
import { compileProfile as compilePublic } from "../dist/profile/public-compiler.js";
import { loadUnicodeCaseTable } from "../dist/profile/unicode-case.js";
import { Lot5Canvas } from "../dist/profile/lot5-canvas.js";
import { semanticRevision } from "../dist/profile/envelope.js";
import { vendoredUnicodeCaseDocument } from "./helpers/unicode-case-vendored.mjs";
import { compilerRegistry as uiRegistryFn, ruleTable as uiRuleTable, schemaBytes as uiSchemaBytes } from "./helpers/compiler-fixture.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");
const uiDir = join(fixtures, "lot5-ui/expectations");
const uiRead = p => readFileSync(join(uiDir, p));
const UNICODE_CASE = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;

// A predicate that errors once evaluated: reading an absent text part inside
// concat refuses instead of returning a boolean.
const badOn = binding => ({
  op: "present",
  value: { op: "concat", values: [{ op: "literal", value: "v:" }, { op: "read", binding, path: "/name" }] },
});
const failingWhen = binding => ({ op: "all", args: [{ op: "true" }, badOn(binding)] });

async function predicateCanvas(mutateProfile) {
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
  assert.equal(loaded.status, "ok", "canvas witness profile loads");
  const descriptors = JSON.parse(uiRead("fixtures/ui-neutral-descriptors.json").toString("utf8")).types;
  const compiled = await compilePublic(loaded.payload, { ...uiRegistry, descriptors });
  assert.equal(compiled.status, "ok", "canvas witness profile compiles");
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
  // Drop every stored label so the failing read refuses instead of matching.
  const dropped = canvas.getSnapshot().result.payload;
  const walk = v => { if (!v || typeof v !== "object") return; delete v.name; for (const child of Object.values(v)) walk(child); };
  walk(dropped.envelope.tree);
  dropped.envelope.semanticRevision = semanticRevision(dropped.envelope.tree, dropped.envelope.profileIdentity, dropped.envelope.bindings);
  canvas.loadSnapshot(dropped);
  return { canvas };
}

async function runCommand(canvas, cmd) {
  return (await canvas.applyCommands({ baseRevision: canvas.currentRevision,
    expectedViewRevision: canvas.stateViewRevision(),
    transactionId: "witness-predicate-command", commands: [cmd] })).result;
}

function ownerOf(canvas) {
  return canvas.getSnapshot().result.payload.envelope.tree.rootElements.find(n => n.$type === "bpmn:Process").id;
}

test("J6 surface command entry when refusal keeps the evaluator code", async () => {
  const { canvas } = await predicateCanvas(p => { p.ui.find(e => e.id === "task-create").when = failingWhen("self"); });
  try {
    const before = canvas.getSnapshot();
    const out = await runCommand(canvas, { command: "surface", entry: "task-create",
      context: { owner: ownerOf(canvas), key: "witness-new", value: "Witness" } });
    assert.equal(out.status, "refused");
    assert.equal(out.code, "profile-type");
    assert.deepEqual(canvas.getSnapshot(), before);
  } finally { canvas.dispose(); }
});

test("J6 upstream command entry when refusal keeps the evaluator code", async () => {
  const { canvas } = await predicateCanvas(p => { p.ui.find(e => e.id === "task-create").when = failingWhen("self"); });
  try {
    const before = canvas.getSnapshot();
    const entry = canvas.profileView.entryById.get("task-create");
    const out = await runCommand(canvas, { command: "upstream", upstream: entry.upstreamEntries[0],
      context: { owner: ownerOf(canvas), key: "witness-new", value: "Witness" } });
    assert.equal(out.status, "refused");
    assert.equal(out.code, "profile-type");
    assert.deepEqual(canvas.getSnapshot(), before);
  } finally { canvas.dispose(); }
});

for (const field of ["visible", "mutable"]) {
  test(`J6 field command ${field} refusal keeps the evaluator code`, async () => {
    const { canvas } = await predicateCanvas(p => {
      p.notions.find(n => n.id === "process").fields.find(f => f.id === "name")[field] = failingWhen("self");
    });
    try {
      const before = canvas.getSnapshot();
      const out = await runCommand(canvas, { command: "field", notion: "process", field: "name",
        context: { target: ownerOf(canvas), value: "Witness" } });
      assert.equal(out.status, "refused");
      assert.equal(out.code, "profile-type");
      assert.deepEqual(canvas.getSnapshot(), before);
    } finally { canvas.dispose(); }
  });
}

function geometryOf(canvas) {
  const snap = canvas.getSnapshot().result.payload;
  const geometry = snap.presentation.layout.geometry;
  const target = geometry.find(g => g.semanticId === "Task_A") ?? geometry.find(g => g.semanticId && g.bounds);
  const other = geometry.find(g => g.semanticId === "Task_B");
  return { target, other };
}

for (const gesture of ["connect", "direct-edit"]) {
  for (const layer of ["entry", "recipe"]) {
    test(`J6 ${gesture} ${layer} when refusal keeps the evaluator code`, async () => {
      const { canvas } = await predicateCanvas(p => {
        for (const entry of p.ui.filter(e => e.surface === gesture)) {
          if (layer === "entry") entry.when = failingWhen("self");
          else p.recipes.find(r => r.id === entry.recipe).when = failingWhen("target");
        }
      });
      try {
        const before = canvas.getSnapshot();
        const { target, other } = geometryOf(canvas);
        const occurrence = g => ({ pageId: g.pageId, occurrenceKey: g.occurrenceKey });
        const out = await canvas.gesture(gesture === "direct-edit"
          ? { gesture, element: target.semanticId, text: "Witness" }
          : { gesture, source: occurrence(target), target: occurrence(other), insertionKey: "witness-link" });
        assert.equal(out.staged, undefined);
        assert.equal(out.outcome?.code, "profile-type");
        assert.deepEqual(canvas.getSnapshot(), before);
      } finally { canvas.dispose(); }
    });
  }
}
