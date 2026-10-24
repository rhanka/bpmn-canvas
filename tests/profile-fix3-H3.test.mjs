// H3 witness: UI `when` errors outside notion recognition must surface
// through the query result instead of filtering as a non-match.
// Recognition-inner refusals stay non-matches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { viewOf } from "../dist/profile/lot5-eval.js";
import { listEntries } from "../dist/profile/lot5-queries.js";
import { TreeIndex } from "../dist/profile/lot5-support.js";
import { descriptorIndex } from "../dist/profile/native-contracts.js";

const types = {
  "x:Doc": { id: true, scalars: ["id"], containment: { items: ["x:Item"] }, references: {} },
  "x:Item": { id: true, scalars: ["id"], containment: {}, references: {} },
};
const descriptors = descriptorIndex({ types });
const tree = { $type: "x:Doc", id: "D", items: [{ $type: "x:Item", id: "P" }] };

const entryOf = (when) => ({
  id: "e1", surface: "palette", group: "g", order: 0,
  label: "e1", icon: { theme: "plain", glyph: "task" },
  when, upstreamEntries: [],
});

const viewOfDoc = (ui, notions = []) => viewOf(
  { notions, recipes: [], messages: [], themes: [],
    exports: [], resources: [], policies: { localeFallback: "en" }, ui },
  { notions: Object.fromEntries(notions.map((n) => [n.id, { recognition: n.recognition }])) },
  types,
);

test("H3 UI when value error outside recognition refuses the query", () => {
  const view = viewOfDoc([entryOf({ op: "present", value: { op: "concat", values: [
    { op: "literal", value: "v:" },
    { op: "read", binding: "self", path: "/name" },
  ] } })]);
  const result = listEntries(view, tree, new TreeIndex(tree), "palette", "P", "en", "r1");
  assert.equal(result.status, "refused");
  assert.equal(result.code, "profile-type");
});

test("H3 refused notion recognition stays a non-match in UI listing", () => {
  const recognition = { op: "present", value: { op: "concat", values: [
    { op: "literal", value: "v:" },
    { op: "read", binding: "self", path: "/name" },
  ] } };
  const view = viewOfDoc(
    [entryOf({ op: "recognizes", binding: "self", notion: "n1" })],
    [{ id: "n1", recognition }],
  );
  const result = listEntries(view, tree, new TreeIndex(tree), "palette", "P", "en", "r1");
  assert.equal(result.status, "ok");
  assert.deepEqual(result.payload.groups, []);
});
