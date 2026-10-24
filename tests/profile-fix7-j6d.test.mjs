/** Fix round 7, J6d: a refused render label evaluation must propagate the
 * original refusal instead of deleting the label and reporting successful
 * rendering, export preparation and autosave. */
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
import { subjectScope } from "../dist/profile/lot5-eval.js";
import { semanticRevision } from "../dist/profile/envelope.js";
import { vendoredUnicodeCaseDocument } from "./helpers/unicode-case-vendored.mjs";
import { compilerRegistry as uiRegistryFn, ruleTable as uiRuleTable, schemaBytes as uiSchemaBytes } from "./helpers/compiler-fixture.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");
const uiDir = join(fixtures, "lot5-ui/expectations");
const uiRead = p => readFileSync(join(uiDir, p));
const UNICODE_CASE = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;

const labelAst = mode => mode === "owner"
  ? { op: "id", binding: "bindingOwner" }
  : { op: "concat", values: [{ op: "literal", value: "v:" }, { op: "read", binding: "self", path: "/name" }] };

async function labelCanvas(mode) {
  const uiRegistry = uiRegistryFn();
  const profile = JSON.parse(uiRead("fixtures/ui-neutral-profile.json").toString("utf8"));
  const ast = labelAst(mode);
  for (const notion of profile.notions) {
    if (notion.id !== "task") continue;
    for (const binding of notion.renderBindings) binding.label = structuredClone(ast);
  }
  // This independent witness profile permits an unnamed task, so the missing
  // label operand refuses without any sealed fixture being edited.
  if (mode === "missing-name") for (const rule of profile.rules) rule.assert = { op: "true" };
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
  if (mode === "missing-name") {
    const dropped = canvas.getSnapshot().result.payload;
    delete new TreeIndex(dropped.envelope.tree).get("Task_A").node.name;
    dropped.envelope.semanticRevision = semanticRevision(dropped.envelope.tree, dropped.envelope.profileIdentity, dropped.envelope.bindings);
    canvas.loadSnapshot(dropped);
  }
  return { canvas };
}

function originalCode(canvas, mode) {
  const snap = canvas.getSnapshot().result.payload;
  const view = canvas.profileView;
  const scope = subjectScope(view, snap.envelope.tree, new TreeIndex(snap.envelope.tree), "Task_A");
  const context = { descriptors: view.descriptors, tree: snap.envelope.tree, bindings: scope.bindings, admission: "lenient" };
  if (canvas.unicodeCase !== undefined) context.unicodeCase = canvas.unicodeCase;
  const result = evaluateValue(labelAst(mode), context, "label");
  assert.equal(result.status, "refused", "the shared evaluator must refuse the admitted label");
  return { code: result.code, snapshot: snap };
}

const sortedUnique = entries => {
  const keys = entries.map(e => JSON.stringify(e));
  return keys.every((k, i) => i === 0 || keys[i - 1] <= k) && new Set(keys).size === keys.length;
};

for (const mode of ["owner", "missing-name"]) {
  for (const route of ["renderData", "workshopExport", "workshopAutosave"]) {
    test(`J6d ${route} propagates the ${mode} label refusal`, async () => {
      const { canvas } = await labelCanvas(mode);
      try {
        const { code, snapshot } = originalCode(canvas, mode);
        const before = canvas.getSnapshot();
        const events = [];
        canvas.onChange(e => events.push(e));
        const endpoint = canvas.profileView.exports[0];
        let result;
        let downloads = 0;
        if (route === "renderData") result = canvas.renderData();
        else if (route === "workshopExport") {
          const out = await canvas.workshopExport({ label: endpoint.label, themeId: snapshot.presentation.themeId, formatId: endpoint.id });
          result = out.download?.prepared ?? out.result;
          downloads = out.download?.callbacks?.length ?? 0;
        } else {
          result = await canvas.workshopAutosave({ format: endpoint.format, label: endpoint.label, theme: snapshot.presentation.themeId });
        }
        assert.deepEqual(canvas.getSnapshot(), before);
        assert.equal(events.length, 0);
        assert.equal(result.status, "refused");
        assert.equal(result.code, code);
        assert.equal(downloads, 0);
      } finally { canvas.dispose(); }
    });
  }

  test(`J6d export preparation keeps the canonical ${mode} refusal entries`, async () => {
    const { canvas } = await labelCanvas(mode);
    try {
      const { code, snapshot } = originalCode(canvas, mode);
      const endpoint = canvas.profileView.exports[0];
      const out = await canvas.workshopExport({ label: endpoint.label, themeId: snapshot.presentation.themeId, formatId: endpoint.id });
      const prepared = out.download?.prepared ?? out.result;
      assert.equal(prepared.status, "refused");
      assert.equal(prepared.code, code);
      assert.equal(out.download?.callbacks?.length ?? 0, 0);
      const entries = prepared.report?.entries ?? prepared.diagnostics ?? [];
      assert.ok(sortedUnique(entries), "refusal entries stay sorted with no duplicates");
    } finally { canvas.dispose(); }
  });
}

for (const mode of ["literal", "empty", "missing-read"]) {
  test(`J6d render label ${mode} stays successful`, async () => {
    const ast = mode === "literal" ? { op: "literal", value: "Shown" }
      : mode === "empty" ? { op: "literal", value: "" }
      : { op: "read", binding: "self", path: "/name" };
    const uiRegistry = uiRegistryFn();
    const profile = JSON.parse(uiRead("fixtures/ui-neutral-profile.json").toString("utf8"));
    for (const notion of profile.notions) {
      if (notion.id !== "task") continue;
      for (const binding of notion.renderBindings) binding.label = structuredClone(ast);
    }
    const loaded = await loadProfile(JSON.stringify(profile), {
      schemaBytes: uiSchemaBytes,
      baseBytes: uiRead("fixtures/ui-neutral-base.json"),
      basePin: { ...profile.base, digestDomain: "raw" },
      descriptorPins: profile.descriptors.map(p => ({ ...p, digestDomain: "raw", descriptorBytes: uiRead("fixtures/ui-neutral-descriptors.json") })),
      compilerRuleTable: uiRuleTable,
      capabilities: { capabilities: uiRegistry.capabilities, signatures: uiRegistry.signatures },
      assetBag: new Map([["ui-neutral-metrics.json", uiRead("fixtures/ui-neutral-metrics.json")]]),
    });
    assert.equal(loaded.status, "ok");
    const descriptors = JSON.parse(uiRead("fixtures/ui-neutral-descriptors.json").toString("utf8")).types;
    const compiled = await compilePublic(loaded.payload, { ...uiRegistry, descriptors });
    assert.equal(compiled.status, "ok");
    const metrics = profile.resources.find(r => r.kind === "metrics");
    const control = new Lot5Canvas({
      compiled: compiled.payload, profileDocument: profile, descriptorTypes: descriptors,
      metricsId: "ui-neutral-metrics", metricsSha256: metrics.sha256, unicodeCase: UNICODE_CASE,
      metricBytes: new Map([[metrics.id, uiRead("fixtures/ui-neutral-metrics.json")]]),
    });
    try {
      const snap = JSON.parse(uiRead("fixtures/documents/basic.snapshot.json"));
      snap.envelope.profileIdentity = compiled.payload.identity;
      if (mode === "missing-read") {
        const walk = v => { if (!v || typeof v !== "object") return; if (v.id === "Task_A") delete v.name; for (const child of Object.values(v)) walk(child); };
        walk(snap.envelope.tree);
      }
      snap.envelope.semanticRevision = semanticRevision(snap.envelope.tree, compiled.payload.identity, snap.envelope.bindings);
      control.loadSnapshot(snap);
      const result = control.renderData();
      assert.equal(result.status, "ok");
      const record = result.payload.occurrences.find(g => g.semanticId === "Task_A");
      assert.ok(record);
      if (mode === "literal") assert.equal(record.label.text, "Shown");
      else assert.equal(record.label, undefined);
    } finally { control.dispose(); }
  });
}
