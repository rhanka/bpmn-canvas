/** Fix round 7, J6c: a refused field display evaluation must keep the
 * evaluator's original code instead of losing it in evalValue and falling
 * back to the raw stored value in displayOf and listFields. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadProfile } from "../dist/profile/compiler.js";
import { compileProfile as compilePublic } from "../dist/profile/public-compiler.js";
import { evaluateValue } from "../dist/profile/compiler.js";
import { loadUnicodeCaseTable } from "../dist/profile/unicode-case.js";
import { Lot5Canvas } from "../dist/profile/lot5-canvas.js";
import { TreeIndex } from "../dist/profile/lot5-support.js";
import { evalValue, subjectScope } from "../dist/profile/lot5-eval.js";
import { listFields } from "../dist/profile/lot5-queries.js";
import { semanticRevision } from "../dist/profile/envelope.js";
import { vendoredUnicodeCaseDocument } from "./helpers/unicode-case-vendored.mjs";
import { compilerRegistry as uiRegistryFn, ruleTable as uiRuleTable, schemaBytes as uiSchemaBytes } from "./helpers/compiler-fixture.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");
const uiDir = join(fixtures, "lot5-ui/expectations");
const uiRead = p => readFileSync(join(uiDir, p));
const UNICODE_CASE = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;

// A display read that refuses once evaluated: concat requires strings, so a
// missing or boolean operand refuses instead of returning a value.
const displayAst = () => ({ op: "concat",
  values: [{ op: "literal", value: "v:" }, { op: "read", binding: "self", path: "/isExecutable" }] });

async function fieldCanvas(configureDisplay, mode) {
  const uiRegistry = uiRegistryFn();
  const profile = JSON.parse(uiRead("fixtures/ui-neutral-profile.json").toString("utf8"));
  configureDisplay(profile);
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
  const dropped = canvas.getSnapshot().result.payload;
  const owner = dropped.envelope.tree.rootElements.find(n => n.$type === "bpmn:Process");
  if (mode === "missing") delete owner.isExecutable;
  else owner.isExecutable = false;
  dropped.envelope.semanticRevision = semanticRevision(dropped.envelope.tree, dropped.envelope.profileIdentity, dropped.envelope.bindings);
  canvas.loadSnapshot(dropped);
  return { canvas, target: owner.id };
}

function originalCode(canvas, tree, target) {
  const view = canvas.profileView;
  const scope = subjectScope(view, tree, new TreeIndex(tree), target);
  const context = { descriptors: view.descriptors, tree, bindings: scope.bindings, admission: "lenient" };
  if (canvas.unicodeCase !== undefined) context.unicodeCase = canvas.unicodeCase;
  const result = evaluateValue(displayAst(), context, "field.display");
  assert.equal(result.status, "refused", "the shared evaluator must refuse the admitted expression");
  return result.code;
}

const configureDisplay = p => {
  p.notions.find(n => n.id === "process").fields.find(f => f.id === "name").display = displayAst();
};

for (const mode of ["missing", "boolean"]) {
  test(`J6c evalValue keeps the original ${mode} operand refusal code`, async () => {
    const { canvas, target } = await fieldCanvas(configureDisplay, mode);
    try {
      const snap = canvas.getSnapshot().result.payload;
      const expected = originalCode(canvas, snap.envelope.tree, target);
      const scope = subjectScope(canvas.profileView, snap.envelope.tree, new TreeIndex(snap.envelope.tree), target);
      const result = evalValue(canvas.profileView, displayAst(), scope, "field.display");
      assert.equal(result.ok, false);
      assert.equal(result.code, expected);
    } finally { canvas.dispose(); }
  });

  test(`J6c module listFields refuses the ${mode} display evaluation with its code`, async () => {
    const { canvas, target } = await fieldCanvas(configureDisplay, mode);
    try {
      const snap = canvas.getSnapshot().result.payload;
      const expected = originalCode(canvas, snap.envelope.tree, target);
      const before = structuredClone(snap.envelope.tree);
      const result = listFields(canvas.profileView, snap.envelope.tree, new TreeIndex(snap.envelope.tree),
        target, "en", canvas.currentRevision, snap.envelope.bindings);
      assert.deepEqual(snap.envelope.tree, before);
      assert.equal(result.status, "refused");
      assert.equal(result.code, expected);
    } finally { canvas.dispose(); }
  });

  test(`J6c canvas listFields refuses the ${mode} display evaluation with its code`, async () => {
    const { canvas, target } = await fieldCanvas(configureDisplay, mode);
    try {
      const snap = canvas.getSnapshot().result.payload;
      const expected = originalCode(canvas, snap.envelope.tree, target);
      const before = canvas.getSnapshot();
      const events = [];
      canvas.onChange(e => events.push(e));
      const result = canvas.listFields({ baseRevision: canvas.currentRevision, targetId: target, locale: "en" });
      assert.deepEqual(canvas.getSnapshot(), before);
      assert.equal(events.length, 0);
      assert.equal(result.status, "refused");
      assert.equal(result.code, expected);
    } finally { canvas.dispose(); }
  });
}

for (const mode of ["absent", "literal", "read"]) {
  test(`J6c field display ${mode} stays successful`, async () => {
    const { canvas, target } = await fieldCanvas(p => {
      if (mode === "literal") p.notions.find(n => n.id === "process").fields.find(f => f.id === "name").display = { op: "literal", value: "Shown" };
      if (mode === "read") p.notions.find(n => n.id === "process").fields.find(f => f.id === "name").display = { op: "read", binding: "self", path: "/name" };
    }, "boolean");
    try {
      const snap = canvas.getSnapshot().result.payload;
      const stored = snap.envelope.tree.rootElements.find(n => n.id === target).name;
      const result = canvas.listFields({ baseRevision: canvas.currentRevision, targetId: target, locale: "en" });
      assert.equal(result.status, "ok");
      assert.equal(result.payload.fields.find(f => f.field === "name").display, mode === "literal" ? "Shown" : stored);
    } finally { canvas.dispose(); }
  });
}
