import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalize, canonicalDigest } from "../dist/profile/canonical.js";
import { MISSING } from "../dist/profile/native-contracts.js";
import { loadUnicodeCaseTable } from "../dist/profile/unicode-case.js";
import { vendoredUnicodeCaseDocument } from "./helpers/unicode-case-vendored.mjs";
import { loadProfile, compileProfile, evaluatePredicate, selectHandles, evaluateValue } from "../dist/profile/compiler.js";
import { compilerInputs, compilerRegistry, ruleTable } from "./helpers/compiler-fixture.mjs";

const unicodeCase = loadUnicodeCaseTable(vendoredUnicodeCaseDocument()).payload;

const mechanism = (name) => JSON.parse(readFileSync(new URL(`./fixtures/profile-parity-corpus/profile-mechanism/1/${name}`, import.meta.url)));
const schemaBytes = readFileSync(new URL("../schemas/profile/profile-mechanism-1.schema.json", import.meta.url));
const descriptors = mechanism("neutral-descriptors.json").types;

const registry = {
  lintConfigs: compilerRegistry().lintConfigs,
  lintAllowlist: compilerRegistry().lintAllowlist,
  requiredStandardRules: compilerRegistry().requiredStandardRules,
  compilerRuleTable: ruleTable,
  capabilities: ["predicates/1", "selectors/1", "recipes/1", "profile-lint/1", "render-data/1", "export-ir/1"],
  signatures: {
    literal: { capability: "predicates/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    read: { capability: "predicates/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    id: { capability: "predicates/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    ids: { capability: "predicates/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    param: { capability: "predicates/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    concat: { capability: "predicates/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    stripPrefix: { capability: "predicates/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    case: { capability: "predicates/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    outputId: { capability: "predicates/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    true: { capability: "predicates/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    false: { capability: "predicates/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    all: { capability: "predicates/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    any: { capability: "predicates/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    not: { capability: "predicates/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    typeIs: { capability: "predicates/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    present: { capability: "predicates/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    equal: { capability: "predicates/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    textPrefix: { capability: "predicates/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    count: { capability: "selectors/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    boundRole: { capability: "predicates/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    recognizes: { capability: "predicates/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    reachable: { capability: "selectors/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    bind: { capability: "recipes/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    create: { capability: "recipes/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    ensure: { capability: "recipes/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    set: { capability: "recipes/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    unset: { capability: "recipes/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    assignRef: { capability: "recipes/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    reparent: { capability: "recipes/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    place: { capability: "recipes/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    emit: { capability: "export-ir/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    loss: { capability: "export-ir/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    remove: { capability: "recipes/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
    refuse: { capability: "recipes/1", version: "1", argumentSchemaDigest: "0".repeat(64) },
  },
  descriptors,
};

function assetBag() {
  return new Map([["neutral-metrics.json", readFileSync(new URL("./fixtures/profile-parity-corpus/profile-mechanism/1/neutral-metrics.json", import.meta.url))]]);
}

async function loaded(name = "neutral-profile.json") {
  const bytes = readFileSync(new URL(`./fixtures/profile-parity-corpus/profile-mechanism/1/${name}`, import.meta.url));
  const result = await loadProfile(bytes, { ...compilerInputs(), schemaBytes, assetBag: assetBag() });
  assert.equal(result.status, "ok");
  return result.payload;
}

test("should load the neutral profile with identity and digest", async () => {
  const { profile, identity } = await loaded();
  assert.equal(identity.mechanismVersion, "1");
  assert.equal(identity.profile, "neutral/1");
  assert.equal(identity.sha256, await canonicalDigest(profile));
});

test("should report lexical codes before schema or compiler checks", async () => {
  for (const [text, code] of [
    ['{"a":1,"a":2}', "profile-json-duplicate-key"],
    ['{"x":1e400}', "profile-number"],
    ['{"x":"\\ud800"}', "profile-unicode"],
    ["{bad}", "profile-json"],
    ["null", "profile-schema"],
  ]) {
    const result = await loadProfile(text, { ...compilerInputs(), schemaBytes });
    assert.equal(result.status, "refused");
    assert.equal(result.code, code, text);
  }
});

test("should compile the neutral profile with pinned signatures", async () => {
  const validated = await loaded();
  const first = await compileProfile(validated, registry);
  assert.equal(first.status, "ok");
  assert.ok(first.payload.digest);
  assert.ok(Object.keys(first.payload.notions).length > 0);
  const second = await compileProfile(validated, registry);
  assert.equal(canonicalize(first.payload), canonicalize(second.payload));
});

test("should substitute the grid profile with a different identity", async () => {
  const plain = await compileProfile(await loaded("neutral-profile.json"), registry);
  const grid = await compileProfile(await loaded("neutral-grid-profile.json"), registry);
  assert.equal(plain.status, "ok");
  assert.equal(grid.status, "ok");
  assert.notEqual(plain.payload.identity.sha256, grid.payload.identity.sha256);
  assert.notEqual(canonicalize(plain.payload.notions), canonicalize(grid.payload.notions));
});

test("should refuse unknown operators, duplicate ids and notion cycles", async () => {
  const validated = await loaded();
  const mutate = async (fn) => {
    const clone = structuredClone(validated.profile);
    fn(clone);
    return loadProfile(JSON.stringify(clone), compilerInputs());
  };
  const badOp = await mutate((p) => { p.rules[0].assert = { op: "sometimes" }; });
  assert.equal(badOp.code, "profile-schema");
  const duplicate = await mutate((p) => { p.notions.push(structuredClone(p.notions[0])); });
  assert.equal((await compileProfile(duplicate.payload, registry)).code, "profile-symbol");
  const cycle = await mutate((p) => {
    p.notions[0].recognition = { op: "recognizes", binding: "self", notion: p.notions[1].id };
    p.notions[1].recognition = { op: "recognizes", binding: "self", notion: p.notions[0].id };
  });
  assert.equal((await compileProfile(cycle.payload, registry)).code, "profile-cycle");
  const unknownNotion = await mutate((p) => {
    p.rules[0].assert = { op: "recognizes", binding: "self", notion: "no-such-notion" };
  });
  assert.equal((await compileProfile(unknownNotion.payload, registry)).code, "profile-symbol");
  const noCaps = await compileProfile(validated, { ...registry, capabilities: [] });
  assert.equal(noCaps.code, "profile-capability");
  const noBag = await loadProfile(readFileSync(new URL("./fixtures/profile-parity-corpus/profile-mechanism/1/neutral-profile.json", import.meta.url)), { ...compilerInputs(), schemaBytes, assetBag: undefined });
  assert.equal(noBag.code, "profile-resource-missing");
});

for (const side of ["from", "to"]) {
  test(`microfix reachable ${side} should expose notion cycles at compile time`, async () => {
    const validated = await loaded();
    const clone = structuredClone(validated.profile);
    const first = clone.notions[0].id;
    const second = clone.notions[1].id;
    const plain = { from: "root", via: "all", where: { op: "true" }, order: "id" };
    const linked = { from: "root", via: "all", where: { op: "recognizes", binding: "self", notion: second }, order: "id" };
    clone.notions[0].recognition = {
      op: "reachable",
      from: side === "from" ? linked : plain,
      to: side === "to" ? linked : plain,
      edgeTypes: ["bpmn:SequenceFlow"],
      minHops: 0,
    };
    clone.notions[1].recognition = { op: "recognizes", binding: "self", notion: first };
    const reloaded = await loadProfile(JSON.stringify(clone), compilerInputs());
    assert.equal(reloaded.status, "ok", reloaded.code);
    assert.equal((await compileProfile(reloaded.payload, registry)).code, "profile-cycle");
  });
}

const synthetic = {
  "bpmn:Definitions": { id: true, scalars: ["id"], containment: { flowElements: ["bpmn:Task", "bpmn:SequenceFlow"] }, references: {} },
  "bpmn:Task": { id: true, scalars: ["id", "name"], containment: {}, references: {} },
  "bpmn:SequenceFlow": { id: true, scalars: ["id", "name", "sourceRef", "targetRef"], containment: {}, references: { sourceRef: ["bpmn:Task"], targetRef: ["bpmn:Task"] } },
};
const tree = {
  $type: "bpmn:Definitions",
  id: "Definitions_1",
  flowElements: [
    { $type: "bpmn:Task", id: "Task_b", name: "second" },
    { $type: "bpmn:Task", id: "Task_a", name: "first" },
    { $type: "bpmn:Task", id: "Task_plain" },
    { $type: "bpmn:SequenceFlow", id: "Flow_1", sourceRef: "Task_a", targetRef: "Task_b" },
  ],
};
const contextFor = (bindings, extra = {}) => ({ descriptors: synthetic, tree, bindings, ...extra });

test("should evaluate predicates without coercion or normalization", async () => {
  const root = { node: tree, pointer: "" };
  const taskA = { node: tree.flowElements[1], pointer: "/flowElements/1" };
  const check = (ast, bindings = { self: taskA, root }) => evaluatePredicate(ast, contextFor(bindings));
  assert.deepEqual(check({ op: "typeIs", binding: "self", type: "bpmn:Task", mode: "exact" }), { status: "ok", payload: true, diagnostics: [] });
  assert.deepEqual(check({ op: "present", value: { op: "read", binding: "self", path: "/name" } }).payload, true);
  const plainTask = { node: tree.flowElements[2], pointer: "/flowElements/2" };
  const checkPlain = (ast) => evaluatePredicate(ast, contextFor({ self: plainTask, root })).payload;
  assert.deepEqual(evaluatePredicate({ op: "present", value: { op: "read", binding: "self", path: "/name" } }, contextFor({ self: plainTask, root })).payload, false);
  assert.deepEqual(check({ op: "equal", left: { op: "literal", value: "first" }, right: { op: "read", binding: "self", path: "/name" } }).payload, true);
  assert.deepEqual(check({ op: "equal", left: { op: "literal", value: 1 }, right: { op: "literal", value: true } }).payload, false);
  assert.deepEqual(evaluatePredicate({ op: "equal", left: { op: "literal", value: "first" }, right: { op: "read", binding: "self", path: "/name" } }, contextFor({ self: plainTask, root })).payload, false);
  assert.deepEqual(check({ op: "textPrefix", value: { op: "read", binding: "self", path: "/name" }, prefix: "fir", trim: "none" }).payload, true);
  assert.deepEqual(check({ op: "textPrefix", value: { op: "literal", value: "\u00a0first" }, prefix: "first", trim: "ecma262-2024-start" }).payload, true);
  assert.deepEqual(check({ op: "textPrefix", value: { op: "literal", value: "\u0085first" }, prefix: "first", trim: "ecma262-2024-start" }).payload, false);
  assert.deepEqual(check({ op: "textPrefix", value: { op: "literal", value: "\u200bfirst" }, prefix: "first", trim: "ecma262-2024-start" }).payload, false);
  assert.deepEqual(check({ op: "count", select: { from: "root", via: "all", where: { op: "typeIs", binding: "self", type: "bpmn:Task", mode: "exact" }, order: "id" }, min: 3 }).payload, true);
  const reached = check({ op: "reachable", from: { from: "root", via: "all", where: { op: "equal", left: { op: "id", binding: "self" }, right: { op: "literal", value: "Task_a" } }, order: "id" },
    to: { from: "root", via: "all", where: { op: "equal", left: { op: "id", binding: "self" }, right: { op: "literal", value: "Task_b" } }, order: "id" },
    edgeTypes: ["bpmn:SequenceFlow"], minHops: 1 });
  assert.deepEqual(reached.payload, true);
});

test("should resolve bound roles only through exact support bindings", async () => {
  const taskA = { node: tree.flowElements[1], pointer: "/flowElements/1" };
  const root = { node: tree, pointer: "" };
  const predicate = { op: "boundRole", binding: "self", owner: "root", role: "lane" };
  assert.deepEqual(evaluatePredicate(predicate, contextFor({ self: taskA, root }, { supportBindings: [{ ownerId: "Definitions_1", role: "lane", targetId: "Task_a" }] })).payload, true);
  assert.deepEqual(evaluatePredicate(predicate, contextFor({ self: taskA, root }, { supportBindings: [{ ownerId: "Definitions_1", role: "lane", targetId: "Task_b" }] })).payload, false);
  assert.deepEqual(evaluatePredicate({ op: "boundRole", binding: "self", owner: "self", role: "lane" },
    contextFor({ self: taskA }, { supportBindings: [{ ownerId: "Task_a", role: "lane", targetId: "Task_a" }] })).payload, true);
  assert.deepEqual(evaluatePredicate({ op: "boundRole", binding: "ghost", owner: "self", role: "lane" },
    contextFor({ self: taskA }, { supportBindings: [{ ownerId: "Task_a", role: "lane", targetId: "Task_a" }] })).payload, false);
});

test("should select in id order with pointer tie-breaks and no duplicates", async () => {
  const root = { node: tree, pointer: "" };
  const selected = selectHandles({ from: "root", via: "all", where: { op: "typeIs", binding: "self", type: "bpmn:Task", mode: "exact" }, order: "id" }, contextFor({ root }));
  assert.equal(selected.status, "ok");
  assert.deepEqual(selected.payload.map((h) => h.node.id), ["Task_a", "Task_b", "Task_plain"]);
  const children = selectHandles({ from: "root", via: "children", property: "flowElements", where: { op: "true" }, order: "id" }, contextFor({ root }));
  assert.equal(children.payload.length, 4);
  const owner = selectHandles({ from: "self", via: "owner", where: { op: "true" }, order: "id" },
    contextFor({ self: { node: tree.flowElements[0], pointer: "/flowElements/0" } }));
  assert.deepEqual(owner.payload.map((h) => h.node.id), ["Definitions_1"]);
  const outgoing = selectHandles({ from: "self", via: "reference", property: "targetRef", where: { op: "true" }, order: "id" },
    contextFor({ self: { node: tree.flowElements[3], pointer: "/flowElements/3" } }));
  assert.deepEqual(outgoing.payload.map((h) => h.node.id), ["Task_b"]);
  const incoming = selectHandles({ from: "self", via: "inverseReference", property: "targetRef", where: { op: "true" }, order: "id" },
    contextFor({ self: { node: tree.flowElements[0], pointer: "/flowElements/0" } }));
  assert.deepEqual(incoming.payload.map((h) => h.node.id), ["Flow_1"]);
  const badWhere = selectHandles({ from: "root", via: "all", where: { op: "read", binding: "nope", path: "/name" }, order: "id" }, contextFor({ root }));
  assert.equal(badWhere.status, "refused");
});

test("should evaluate values with strict contexts and refuse outputId outside emit", async () => {
  const taskA = { node: tree.flowElements[1], pointer: "/flowElements/1" };
  const context = contextFor({ self: taskA, root: { node: tree, pointer: "" } });
  assert.deepEqual(evaluateValue({ op: "concat", values: [{ op: "literal", value: "a" }, { op: "read", binding: "self", path: "/name" }] }, context, "test").payload, "afirst");
  assert.deepEqual(evaluateValue({ op: "stripPrefix", value: { op: "literal", value: "  unfirst" }, prefix: "un", trim: "ecma262-2024-start" }, context, "test").payload, "first");
  assert.deepEqual(evaluateValue({ op: "stripPrefix", value: { op: "literal", value: "  first " }, prefix: "first", trim: "ecma262-2024-start" }, context, "test").payload, " ");
  assert.deepEqual(evaluateValue({ op: "stripPrefix", value: { op: "literal", value: "first" }, prefix: "un", trim: "ecma262-2024-start" }, context, "test").payload, "first");
  assert.deepEqual(evaluateValue({ op: "case", value: { op: "literal", value: "first" }, mode: "upper" }, { ...context, unicodeCase }, "test").payload, "FIRST");
  assert.deepEqual(evaluateValue({ op: "case", value: { op: "literal", value: "ß" }, mode: "upper" }, { ...context, unicodeCase }, "test").payload, "SS");
  assert.equal(evaluateValue({ op: "case", value: { op: "literal", value: "first" }, mode: "upper" }, context, "test").code, "profile-resource-missing");
  const plainContext = contextFor({ self: { node: tree.flowElements[2], pointer: "/flowElements/2" } });
  assert.deepEqual(evaluateValue({ op: "read", binding: "self", path: "/name" }, plainContext, "test").payload, MISSING);
  assert.deepEqual(evaluateValue({ op: "read", binding: "self", path: "/missing" }, context, "test").code, "profile-type");
  assert.deepEqual(evaluateValue({ op: "ids", select: { from: "root", via: "all", where: { op: "true" }, order: "id" } }, context, "assignRef.values").status, "ok");
  assert.deepEqual(evaluateValue({ op: "ids", select: { from: "root", via: "all", where: { op: "true" }, order: "id" } }, context, "test").code, "profile-value-context");
  assert.deepEqual(evaluateValue({ op: "outputId", binding: "self", domain: "node" }, context, "test").code, "profile-value-context");
});

test("should resist malicious bindings and bound evaluation", async () => {
  const root = { node: tree, pointer: "" };
  const polluted = JSON.parse('{"self":{"node":{"$type":"bpmn:Task","id":"Task_a"},"pointer":"/x"},"__proto__":{"polluted":true}}');
  const result = evaluatePredicate({ op: "typeIs", binding: "self", type: "bpmn:Task", mode: "exact" },
    contextFor(polluted));
  assert.equal(result.status, "ok");
  assert.equal({}.polluted, undefined);
  void root;
  let deep = { op: "true" };
  for (let i = 0; i < 400; i++) deep = { op: "not", arg: deep };
  assert.equal(evaluatePredicate(deep, contextFor({})).code, "resource-limit");
});
