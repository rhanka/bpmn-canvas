import { test } from "node:test";
import assert from "node:assert/strict";
import { testOccurrencePredicate } from "../dist/profile/lot4-query.js";
import { descriptorIndex } from "../dist/profile/native-contracts.js";

// G3: export occurrence `present` must not turn a value type error into
// false. Only MISSING reads as absent; every other evaluation error
// propagates to the refusing caller (shared present contract, DESIGN L144).
const descriptors = descriptorIndex({ types: {
  "bpmn:Definitions": { id: true, scalars: ["id"], containment: {}, references: {} },
} });
const tree = { $type: "bpmn:Definitions", id: "D" };
const scopeOf = (self) => ({
  occurrences: [],
  pages: [],
  semanticOf: () => undefined,
  childrenOf: () => [],
  evalBase: { descriptors, tree, bindings: { root: { node: tree, pointer: "" } } },
  bound: { self },
});
const codeOf = (error) => error?.code ?? error?.message ?? String(error);

test("G3 present propagates a concat type error instead of false", () => {
  const scope = scopeOf({});
  const predicate = { op: "present", value: { op: "concat", values: [
    { op: "literal", value: "a" },
    { op: "read", binding: "self", path: "/nick" },
  ] } };
  assert.throws(() => testOccurrencePredicate(predicate, scope),
    (error) => codeOf(error) === "profile-type");
});

test("G3 present stays decidable for present and absent reads", () => {
  const scope = scopeOf({ nick: "x" });
  assert.equal(testOccurrencePredicate(
    { op: "present", value: { op: "read", binding: "self", path: "/nick" } }, scope), true);
  assert.equal(testOccurrencePredicate(
    { op: "present", value: { op: "read", binding: "self", path: "/missing" } }, scope), false);
});
