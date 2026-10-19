import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { loadProfile, evaluatePredicate, evaluateValue } from "../dist/profile/compiler.js";
import { compileProfile, compiledState } from "../dist/profile/public-compiler.js";
import { nativeIndex, MISSING } from "../dist/profile/native-contracts.js";
import { semanticRevision } from "../dist/profile/envelope.js";
import { planRecipe, applyPlan } from "../dist/profile/planning.js";
import { viewOf, recognizedNotions } from "../dist/profile/lot5-eval.js";
import { loadUnicodeCaseTable } from "../dist/profile/unicode-case.js";
import { compilerInputs, compilerRegistry } from "./helpers/compiler-fixture.mjs";
import { vendoredUnicodeCaseDocument } from "./helpers/unicode-case-vendored.mjs";
import { substitution } from "./fixtures/x24-externalization/expectations/derive/comparators.mjs";

const root = new URL("./fixtures/x24-externalization/expectations/", import.meta.url);
const load = path => JSON.parse(readFileSync(new URL(path, root)));
const input = (c, role) => c.inputArtifacts.find(a => a.role === role).json;
const unicodeCase = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;
const cache = new Map();
function profileOf(ref) {
  if (cache.has(ref.sha256)) return cache.get(ref.sha256);
  const bytes = readFileSync(new URL(ref.path, root));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), ref.sha256);
  const loaded = loadProfile(bytes, compilerInputs());
  assert.equal(loaded.status, "ok", loaded.code);
  const compiled = compileProfile(loaded.payload, { ...compilerRegistry(), unicodeCase });
  assert.equal(compiled.status, "ok", compiled.code);
  const result = { profile: JSON.parse(bytes), compiled: compiled.payload, descriptors: compiledState(compiled.payload).registry.descriptors };
  cache.set(ref.sha256, result);
  return result;
}
async function observe(c, ref) {
  const { profile, compiled, descriptors } = profileOf(ref);
  const elements = c.inputArtifacts.find(a => a.role === "elements")?.json ?? [];
  const owner = { $type: "bpmn:Process", id: "P1", flowElements: elements.filter(e => e.$type !== "bpmn:TextAnnotation"), artifacts: elements.filter(e => e.$type === "bpmn:TextAnnotation") };
  const tree = { $type: "bpmn:Definitions", id: "Defs", rootElements: [owner] };
  const index = nativeIndex(tree, descriptors);
  const view = viewOf(profile, compiled, descriptors, unicodeCase);
  if (c.operation === "x24.profile.create") {
    const envelope = { documentVersion: "1", profileIdentity: compiled.identity, tree, bindings: [], semanticRevision: semanticRevision(tree, compiled.identity, []) };
    const plan = await planRecipe(compiled, envelope, input(c, "recipe"), input(c, "params"), { actor: "editor", activation: "edit" });
    assert.equal(plan.status, "ok", plan.code);
    const applied = await applyPlan(plan.payload, structuredClone(tree), structuredClone(envelope));
    assert.equal(applied.status, "ok", applied.code);
    const write = plan.payload.writes.find(write => write.op === "create");
    const created = nativeIndex(applied.payload.tree, descriptors).byId.get(write.id).node;
    return { element: created, parent: write.parent.id, property: write.property };
  }
  const results = [];
  for (const element of elements) {
    const context = { descriptors, tree, bindings: { self: index.byId.get(element.id) }, notions: compiled.notions, unicodeCase };
    const ids = recognizedNotions(view, { tree, index, bindings: context.bindings, supportBindings: [] });
    const recognized = profile.notions.filter(notion => ids.includes(notion.id));
    if (c.operation === "x24.profile.recognize") { results.push({ id: element.id, notions: recognized.map(notion => notion.id) }); continue; }
    for (const notion of recognized) for (const binding of notion.renderBindings) {
      const label = evaluateValue(binding.label, context, "label");
      assert.equal(label.status, "ok", label.code);
      results.push({ id: element.id, notion: notion.id, ...(label.payload !== MISSING ? { label: label.payload } : {}),
        ...(c.operation === "x24.profile.bindings" ? { theme: binding.theme, glyph: binding.glyph, tokens: binding.tokens } : {}) });
    }
  }
  return results;
}
for (const row of load("manifest.json").cases) {
  const c = load(row.path);
  if (!c.operation.startsWith("x24.profile.")) continue;
  test(`${c.caseId} sealed native profile substitution`, async () => {
    const runs = {};
    for (const key of ["a", "b"]) runs[key] = { status: "success", artifacts: { results: await observe(c, input(c, `profile-${key}`)) } };
    assert.deepEqual(substitution(c, { runs }).failures, [], c.caseId);
  });
}
