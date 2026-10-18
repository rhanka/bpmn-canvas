import { test } from "node:test";
import assert from "node:assert/strict";
import { expectations, readJson } from "./helpers/profile-step3.mjs";
import { canonicalize, canonicalDigest, stableId } from "../dist/profile/canonical.js";
import { descriptorIndex, allocateMissingIds, validateSupportBindings, remapNativeIds, reserveStableId, nativeIndex, createIdentity,
  readNative, MISSING, typeMatches, validateNativeReferences, checkDeletionReferences, checkBindingRecovery, validateIdentityDelta } from "../dist/profile/native-contracts.js";
import { supportRoles } from "./helpers/profile-native.mjs";

const descriptors = descriptorIndex(readJson("profile-mechanism/1/neutral-support-fixture.R31.json").descriptors);
const vectors = expectations.filter(v => v.family === "identity-lifecycle");
const vector = scenario => vectors.find(v => v.scenario === scenario);
const input = v => v.inputArtifacts[0].json;
const output = v => v.expectedArtifacts.find(a => a.role === "output").json;

for (const scenario of ["root-first", "missing-siblings", "reorder", "rename"]) {
  test(`should match sealed identity allocation ${scenario}`, async () => {
    const i = input(vector(scenario)), golden = output(vector(scenario));
    const source = i.tree ?? i.ownerSubtree, before = canonicalize(source);
    const actual = await allocateMissingIds(source, descriptors);
    assert.deepEqual(actual.tree, golden.tree ?? golden.ownerSubtree);
    assert.deepEqual(actual.createdIds, golden.allocationOrder ?? golden.createdIds);
    if (golden.contentSignatures) {
      assert.deepEqual(actual.allocations.map(a => a.contentSignature), golden.contentSignatures);
      assert.deepEqual(actual.allocations.map(a => a.duplicateOrdinal), golden.duplicateOrdinals);
      assert.deepEqual(actual.allocations.map(a => a.stableKey), golden.stableKeys);
    }
    assert.equal(canonicalize(source), before);
  });
}

test("should allocate under an ID-less parent using only the explicit owner", async () => {
  const i = input(vector("idless-parent")), a = i.action, expected = output(vector("idless-parent"));
  const node = await createIdentity(a.type, "allocated", {
    ownerId: a.ownerId.value, slot: a.slot, key: a.key.value, fields: { name: a.fields[0].value.value }
  }, { ...descriptors, "bpmn:DataInput": { id: true, scalars: ["id", "name"], containment: {}, references: {} } });
  assert.deepEqual(node, expected.tree.rootElements[0].ioSpecification.dataInputs[0]);
  assert.deepEqual([node.id], expected.createdIds);
});

test("should keep containment-only creation ID-less and reject allocator fields", async () => {
  const i = input(vector("containment")), expected = output(vector("containment"));
  const fields = { text: i.parameters.body, textFormat: "text/plain" };
  assert.deepEqual(await createIdentity("bpmn:Documentation", "containment", { fields }, descriptors), expected.tree.rootElements[0].documentation[0]);
  await assert.rejects(() => createIdentity("bpmn:Documentation", "containment", { fields, ownerId: "P" }, descriptors), { code: "profile-create-identity" });
});

// These are supplied-transition contract checks, not execution of ensure, N or history.
for (const scenario of ["five-supports", "fixed-point", "imported-id", "multi-process", "recreate", "undo"]) {
  test(`should validate supplied sealed support identity contract ${scenario}`, async () => {
    const i = input(vector(scenario)), candidate = output(vector(scenario));
    validateSupportBindings(candidate.tree, candidate.bindings, descriptors, supportRoles);
    const index = nativeIndex(candidate.tree, descriptors);
    for (const id of candidate.createdIds ?? []) assert.ok(index.byId.has(id));
    if (scenario === "recreate") assert.equal(await stableId(i.ownerId, i.slot, i.stableKey), candidate.createdIds[0]);
    if (scenario === "undo") assert.deepEqual({ tree: candidate.tree, bindings: candidate.bindings }, i.saved);
    const altered = structuredClone(candidate.bindings);
    altered[0].targetId = "Missing_target";
    assert.throws(() => validateSupportBindings(candidate.tree, altered, descriptors, supportRoles), { code: "support-binding-conflict" });
  });
}

for (const scenario of ["duplicate-role", "band-process-ref", "wrong-parent"]) {
  test(`should refuse sealed support ownership ${scenario} without changing source`, () => {
    const i = input(vector(scenario)), before = canonicalize(i);
    assert.throws(() => validateSupportBindings(i.tree, i.bindings, descriptors, supportRoles), { code: "support-binding-conflict" });
    assert.equal(canonicalize(i), before);
  });
}

test("should refuse a sealed computed ID collision with an unrelated object", async () => {
  const i = input(vector("collision"));
  await assert.rejects(() => reserveStableId(i.tree, descriptors, "Process_A", "reference-band", "reference-band"), { code: "id-collision" });
});

test("should remap owners and descriptor references while preserving actual support IDs", () => {
  const i = input(vector("owner-remap")), golden = output(vector("owner-remap"));
  const before = canonicalize(i);
  assert.deepEqual(remapNativeIds(i.tree, i.bindings, i.migration.map, descriptors), { tree: golden.tree, bindings: golden.bindings, idMap: golden.idMap });
  assert.equal(canonicalize(i), before);
});

test("should reject duplicate IDs, opaque fields and remap collisions atomically", () => {
  const i = input(vector("owner-remap")), before = canonicalize(i);
  assert.throws(() => remapNativeIds(i.tree, i.bindings, [{ sourceId: "Process_A", resultId: "Definitions_support", domain: "migration" }], descriptors));
  const source = structuredClone(i.tree); source["ext:opaque"] = { ref: "Process_A" };
  assert.throws(() => remapNativeIds(source, i.bindings, i.migration.map, descriptors), { code: "migration-reference-opaque" });
  assert.equal(canonicalize(i), before);
});

test("should derive five support allocation domains independently of labels and bindings", async () => {
  const v = vector("five-supports"), i = input(v), expected = output(v);
  const created = [];
  for (const step of i.recipe.steps.filter(s => s.op === "ensure")) {
    const owner = step.ownerId.binding === "root" ? i.tree.id : i.tree.rootElements[0].id;
    const key = step.key.op === "id" ? i.tree.rootElements[0].id : step.key.value;
    created.push(await stableId(owner, step.slot, key));
  }
  assert.deepEqual(created, expected.createdIds);
  // Existing imported identities are validated by bindings, never recalculated from labels.
  const imported = input(vector("imported-id"));
  validateSupportBindings(imported.tree, imported.bindings, descriptors, supportRoles);
  assert.ok(imported.bindings.every(b => !created.includes(b.targetId)));
});

test("should validate the sealed deletion delta without recreating an unneeded role", async () => {
  const i = input(vector("delete-no-need")), golden = output(vector("delete-no-need"));
  checkDeletionReferences(i.dependencyClosure, [], "refuseIfReferenced");
  await validateIdentityDelta(i.tree, golden.tree, descriptors, { created: [], deleted: [i.targetId] });
  validateSupportBindings(golden.tree, golden.bindings, descriptors, supportRoles);
  assert.ok(!golden.bindings.some(b => b.targetId === i.targetId));
  await assert.rejects(() => validateIdentityDelta(i.tree, golden.tree, descriptors, { created: [], deleted: [] }));
});

test("should refuse the sealed live-reference deletion and unselected recovery", () => {
  const deletion = input(vector("live-reference")), recovery = input(vector("binding-recovery"));
  assert.throws(() => checkDeletionReferences(deletion.inboundReferences, deletion.declaredDependents, deletion.policy));
  assert.throws(() => checkBindingRecovery({ trustedGeneratedDocument: recovery.trustedGeneratedDocument,
    creationProvenanceVerified: recovery.creationProvenanceVerified, exactTypeParentOwnerVerified: recovery.exactTypeParentOwnerVerified,
    recoveryTransactionSelected: recovery.recoveryTransactionSelected }));
});

test("should reject candidate leakage on the sealed late-refusal boundary", async () => {
  const i = input(vector("rollback")), golden = output(vector("rollback"));
  assert.deepEqual(golden.source, { tree: i.tree, bindings: i.bindings });
  // A valid supplied no-change delta is the only candidate allowed by this
  // identity contract; executing the refusing recipe remains a later probe.
  await validateIdentityDelta(i.tree, golden.source.tree, descriptors, { created: [], deleted: [] });
  const partial = structuredClone(i.tree);
  partial.rootElements.push({ $type: "bpmn:Collaboration", id: "Partial_candidate" });
  await assert.rejects(() => validateIdentityDelta(i.tree, partial, descriptors, { created: [], deleted: [] }));
});

test("should distinguish raw MISSING, false, null and dangling references without defaults", () => {
  assert.equal(readNative({ $type: "bpmn:Process", id: "P" }, "/isExecutable", descriptors), MISSING);
  assert.equal(readNative({ $type: "bpmn:Process", id: "P", isExecutable: false }, "/isExecutable", descriptors), false);
  assert.throws(() => readNative({ $type: "bpmn:Process", id: "P", isExecutable: null }, "/isExecutable", descriptors));
  assert.throws(() => validateNativeReferences({ $type: "bpmn:Definitions", id: "D", rootElements: [
    { $type: "bpmn:Collaboration", id: "C", participants: [{ $type: "bpmn:Participant", id: "B", processRef: "Absent" }] }
  ] }, descriptors), { code: "reference-dangling" });
});

test("should use explicit descriptor inheritance for exact and assignable types", () => {
  const types = descriptorIndex({ types: { ...descriptors, "bpmn:ServiceTask": { ...descriptors["bpmn:ServiceTask"], extends: ["bpmn:Task"] } } });
  assert.equal(typeMatches("bpmn:ServiceTask", "bpmn:Task", "exact", types), false);
  assert.equal(typeMatches("bpmn:ServiceTask", "bpmn:Task", "assignable", types), true);
  assert.equal(typeMatches("bpmn:Task", "bpmn:ServiceTask", "assignable", types), false);
  assert.throws(() => descriptorIndex({ types: { A: { id: true, scalars: [], containment: {}, references: {}, extends: ["A"] } } }), { code: "profile-cycle" });
  assert.throws(() => nativeIndex({ $type: "bpmn:Task", id: "Task\n" }, descriptors));
});
