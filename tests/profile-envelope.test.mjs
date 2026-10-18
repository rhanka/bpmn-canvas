import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expectations, readJson } from "./helpers/profile-step3.mjs";
import { compileSchema } from "../dist/profile/contracts.js";
import { canonicalDigest } from "../dist/profile/canonical.js";
import { validateEnvelope, sortBindings, semanticRevision, importRevision, projectSemanticTree, profileIdentity } from "../dist/profile/envelope.js";
import { descriptorIndex, validateSupportBindings } from "../dist/profile/native-contracts.js";
import { supportRoles } from "./helpers/profile-native.mjs";

const descriptors = descriptorIndex(readJson("profile-mechanism/1/neutral-support-fixture.R31.json").descriptors);
// This imported storage field is required by DESIGN:425; the synthetic slice
// predates it. Supply its descriptor explicitly, without changing sealed data.
descriptors["bpmn:Definitions"].scalars.push("exporterVersion");
const schema = JSON.parse(readFileSync(new URL("../schemas/profile/document-envelope-1.schema.json", import.meta.url)));
const syntax = await compileSchema(schema);
const v = id => expectations.find(v => v.caseId === `s2b-envelope-${id}`);
const input = v => v.inputArtifacts[0].json;
const output = v => v.expectedArtifacts.find(a => a.role === "output").json;
const revision = e => semanticRevision(e.tree, e.profileIdentity, e.bindings);

for (const scenario of ["valid", "unknown-field", "null", "duplicate-binding", "revision-mismatch"]) {
  test(`should enforce sealed envelope ${scenario}`, async () => {
    const vector = v(scenario), i = input(vector), golden = output(vector);
    const before = JSON.stringify(i);
    const run = () => scenario === "duplicate-binding" ? validateSupportBindings(i.envelope.tree, i.envelope.bindings, descriptors, supportRoles)
      : validateEnvelope(i.envelope, { syntax, descriptors, supportRoles, storageValidator: () => true });
    if (vector.expectedStatus === "ok") assert.deepEqual(await run(), golden);
    else {
      const code = vector.expectedArtifacts[0].json.code;
      await assert.rejects(async () => run(), error => !code || error.code === code);
      assert.equal(golden.committed, false);
      assert.deepEqual(golden.source, i.envelope);
      if (golden.requiredRevision) assert.equal(await revision(i.envelope), golden.requiredRevision);
    }
    assert.equal(JSON.stringify(i), before);
  });
}

test("should match sealed binding order and revision tuples", async () => {
  const i = input(v("binding-order")), golden = output(v("binding-order"));
  const bindings = sortBindings(i.bindings);
  assert.deepEqual({ bindings, semanticRevision: await semanticRevision(i.tree, i.profileIdentity, bindings) }, golden);
  const change = input(v("binding-change"));
  assert.deepEqual({ beforeRevision: await semanticRevision(change.tree, change.profileIdentity, change.beforeBindings),
    revision: await semanticRevision(change.tree, change.profileIdentity, change.afterBindings) }, output(v("binding-change")));
});

test("should bind approved semantic changes, package changes and saved undo state", async () => {
  const rename = input(v("semantic-change")), tree = structuredClone(rename.envelope.tree);
  tree.rootElements.find(n => n.id === rename.targetId).name = rename.name;
  assert.deepEqual({ tree, baseRevision: await revision(rename.envelope), revision: await semanticRevision(tree, rename.envelope.profileIdentity, []) }, output(v("semantic-change")));
  const change = input(v("profile-change")), golden = output(v("profile-change"));
  assert.equal(await semanticRevision(change.envelope.tree, change.targetIdentity, []), golden.revision);
  assert.equal(await revision(change.envelope), golden.baseRevision);
  const undo = input(v("undo-revision"));
  assert.equal(await revision(undo.saved), output(v("undo-revision")).revision);
  assert.equal(await revision(undo.current), output(v("undo-revision")).baseRevision);
});

test("should keep semantic identity across sealed view-only inputs (hash tuples only)", async () => {
  const i = input(v("theme-switch")), golden = output(v("theme-switch"));
  const identity = await profileIdentity(i.profile);
  assert.equal(await semanticRevision(i.tree, identity, []), golden.revision);
  assert.equal(await canonicalDigest(i.before), golden.beforeViewRevision);
  assert.equal(await canonicalDigest(i.after), golden.viewRevision);
  const drag = input(v("di-only")), expected = output(v("di-only"));
  assert.equal(await revision(drag.envelope), expected.revision);
  for (const [layout, key] of [[drag.beforeLayout, "beforeViewRevision"], [drag.afterLayout, "viewRevision"]]) {
    assert.equal(await canonicalDigest({ ...drag.viewInputs, layoutDigest: await canonicalDigest(layout) }), expected[key]);
  }
});

for (const scenario of ["semantic-extension", "projection-unknown-role"]) {
  test(`should enforce descriptor projection ${scenario}`, async () => {
    const i = input(v(scenario)), before = JSON.stringify(i);
    const roles = i.descriptorRoles;
    if (scenario === "projection-unknown-role") assert.throws(() => projectSemanticTree(i.source, descriptors, roles), { code: "descriptor-role-unknown" });
    else {
      const projected = projectSemanticTree(i.source, descriptors, roles), golden = output(v(scenario));
      assert.deepEqual(projected, { tree: golden.tree, extractedPresentation: golden.extractedPresentation });
      assert.equal(await semanticRevision(projected.tree, i.profileIdentity, i.bindings), golden.semanticRevision);
    }
    assert.equal(JSON.stringify(i), before);
  });
}

for (const scenario of ["import-json-spacing", "import-xml-spacing"]) {
  test(`should match sealed initial ${scenario} revision domains`, async () => {
    const i = input(v(scenario));
    const results = await Promise.all(i.sources.map(s => importRevision(i.format, s)));
    assert.deepEqual({ sourceDigests: results.map(r => r.sourceDigest), baseRevisions: results.map(r => r.baseRevision) }, output(v(scenario)));
  });
}

test("should omit all revisions when strict native parsing fails", async () => {
  const i = input(v("parse-failure"));
  await assert.rejects(() => importRevision(i.format, i.source), error => !Object.hasOwn(error, "baseRevision") && !Object.hasOwn(error, "revision"));
});

test("should reject unsorted bindings, nested identity extras, null and storage refusal", async () => {
  const e = structuredClone(input(v("valid")).envelope);
  e.profileIdentity.extra = true;
  await assert.rejects(() => validateEnvelope(e, { syntax, descriptors, supportRoles, storageValidator: () => true }));
  delete e.profileIdentity.extra;
  await assert.rejects(() => validateEnvelope(e, { syntax, descriptors, supportRoles, storageValidator: () => false }));
  assert.equal(syntax({ ...e, bindings: [{ ownerId: "p", role: "r", targetId: "t", extra: 1 }] }).valid, false);
  e.tree.rootElements[0].name = null;
  await assert.rejects(() => validateEnvelope(e, { syntax, descriptors, supportRoles, storageValidator: () => true }));
});
