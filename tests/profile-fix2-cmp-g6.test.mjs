import { test } from "node:test";
import assert from "node:assert/strict";
import { selectHandles } from "../dist/profile/compiler.js";
import { descriptorIndex } from "../dist/profile/native-contracts.js";

// G6: `via: reference` (and `inverseReference`) silently skipped invalid
// reference properties. A scalar or unknown property is
// profile-selector-property, not an empty selection; only heterogeneous
// candidates lacking a declared optional reference are skipped per handle.
const descriptors = descriptorIndex({ types: {
  "x:Root": { id: true, scalars: ["id"], containment: { items: ["x:Task", "x:Flow"] }, references: {} },
  "x:Task": { id: true, scalars: ["id", "name"], containment: {}, references: {} },
  "x:Flow": { id: true, scalars: ["id"], containment: {}, references: { sourceRef: ["x:Task"], targetRef: ["x:Task"] } },
} });
const tree = { $type: "x:Root", id: "R", items: [
  { $type: "x:Task", id: "a", name: "alpha" },
  { $type: "x:Task", id: "b" },
  { $type: "x:Flow", id: "f", sourceRef: "a", targetRef: "b" },
] };
const handle = (pointer, node) => ({ node, pointer });
const rootHandle = handle("", tree);
const flowHandle = handle("/items/2", tree.items[2]);
const taskHandle = handle("/items/0", tree.items[0]);
const contextOf = (bindings, extra = {}) => ({ descriptors, tree, bindings, ...extra });
const codeOf = (result) => result.status === "refused" ? result.code : `ok:${JSON.stringify(result.payload)}`;

test("G6 reference with a scalar property refuses", () => {
  const result = selectHandles({ from: "self", via: "reference", property: "name",
    where: { op: "true" }, order: "id" }, contextOf({ self: flowHandle }));
  assert.equal(result.status, "refused", codeOf(result));
  assert.equal(result.code, "profile-selector-property");
});

test("G6 reference with an unknown property refuses", () => {
  const result = selectHandles({ from: "self", via: "reference", property: "nope",
    where: { op: "true" }, order: "id" }, contextOf({ self: flowHandle }));
  assert.equal(result.status, "refused", codeOf(result));
  assert.equal(result.code, "profile-selector-property");
});

test("G6 inverseReference with scalar and unknown properties refuses", () => {
  for (const property of ["name", "nope"]) {
    const result = selectHandles({ from: "self", via: "inverseReference", property,
      where: { op: "true" }, order: "id" }, contextOf({ self: taskHandle }));
    assert.equal(result.status, "refused", `${property}:${codeOf(result)}`);
    assert.equal(result.code, "profile-selector-property");
  }
});

test("G6 heterogeneous candidates lacking the reference are skipped", () => {
  const result = selectHandles({ from: "sel", via: "reference", property: "targetRef",
    where: { op: "true" }, order: "id" }, contextOf({ sel: [rootHandle, flowHandle] }));
  assert.equal(result.status, "ok", codeOf(result));
  assert.deepEqual(result.payload.map((h) => h.node.id), ["b"]);
});

test("G6 declared references still resolve", () => {
  const outgoing = selectHandles({ from: "self", via: "reference", property: "targetRef",
    where: { op: "true" }, order: "id" }, contextOf({ self: flowHandle }));
  assert.equal(outgoing.status, "ok", codeOf(outgoing));
  assert.deepEqual(outgoing.payload.map((h) => h.node.id), ["b"]);
  const incoming = selectHandles({ from: "self", via: "inverseReference", property: "targetRef",
    where: { op: "true" }, order: "id" }, contextOf({ self: handle("/items/1", tree.items[1]) }));
  assert.equal(incoming.status, "ok", codeOf(incoming));
  assert.deepEqual(incoming.payload.map((h) => h.node.id), ["f"]);
});

test("G6 base-declared ID scalar reference still resolves", () => {
  const named = structuredClone(tree);
  named.items[0].name = "b";
  const context = contextOf({ self: handle("/items/0", named.items[0]) },
    { idRefScalars: ["x:Task.name"] });
  const result = selectHandles({ from: "self", via: "reference", property: "name",
    where: { op: "true" }, order: "id" }, { ...context, tree: named });
  assert.equal(result.status, "ok", codeOf(result));
  assert.deepEqual(result.payload.map((h) => h.node.id), ["b"]);
});
