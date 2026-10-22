// H4 witness: `via: reference` validates the property per selected source
// type. A declared scalar lacking that type's ID-reference qualification
// refuses, even when another descriptor declares the name as a reference.
// Candidates merely lacking the optional reference are still skipped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectHandles } from "../dist/profile/compiler.js";
import { descriptorIndex } from "../dist/profile/native-contracts.js";

const descriptors = descriptorIndex({ types: {
  "x:Root": { id: true, scalars: ["id"], containment: { items: ["x:Scalar", "x:Ref"] }, references: {} },
  "x:Scalar": { id: true, scalars: ["id", "target"], containment: {}, references: {} },
  "x:Ref": { id: true, scalars: ["id"], containment: {}, references: { target: ["x:Scalar"] } },
} });
const scalar = { $type: "x:Scalar", id: "S", target: "qq" };
const tree = { $type: "x:Root", id: "R", items: [scalar, { $type: "x:Ref", id: "F", target: "S" }] };
const contextOf = (bindings) => ({ tree, descriptors, bindings });

test("H4 declared scalar does not traverse as another type's reference name", () => {
  const result = selectHandles({ from: "self", via: "reference", property: "target",
    order: "id", where: { op: "true" } },
  contextOf({ self: { node: scalar, pointer: "/items/0" } }));
  assert.equal(result.status, "refused");
  assert.equal(result.code, "profile-selector-property");
});

test("H4 declared reference still resolves and missing holders are skipped", () => {
  const ref = tree.items[1];
  const resolved = selectHandles({ from: "self", via: "reference", property: "target",
    order: "id", where: { op: "true" } },
  contextOf({ self: { node: ref, pointer: "/items/1" } }));
  assert.equal(resolved.status, "ok");
  assert.deepEqual(resolved.payload.map((h) => h.node.id), ["S"]);
  const mixed = selectHandles({ from: "sel", via: "reference", property: "target",
    order: "id", where: { op: "true" } },
  contextOf({ sel: [{ node: tree, pointer: "" }, { node: ref, pointer: "/items/1" }] }));
  assert.equal(mixed.status, "ok");
  assert.deepEqual(mixed.payload.map((h) => h.node.id), ["S"]);
});
