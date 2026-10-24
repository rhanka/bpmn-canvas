import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluatePredicate } from "../dist/profile/compiler.js";
import { descriptorIndex } from "../dist/profile/native-contracts.js";
import { lot4EvalContext, testOccurrencePredicate } from "../dist/profile/lot4-query.js";
import { recommendedRuleNames } from "../dist/profile/lint-bridge.js";
import { viewOf, scopeOf, recognizedNotions } from "../dist/profile/lot5-eval.js";
import { TreeIndex } from "../dist/profile/lot5-support.js";
import { compilerInputs, compilerRegistry } from "./helpers/compiler-fixture.mjs";

// G4: one recognition-specific non-match boundary shared by lint, UI and
// export. A refused notion recognition is a non-match everywhere; errors
// raised outside a notion recognition still surface.
const synthetic = descriptorIndex({ types: {
  "bpmn:Definitions": { id: true, scalars: ["id"], containment: { rootElements: ["bpmn:Process"] }, references: {} },
  "bpmn:Process": { id: true, scalars: ["id"], containment: { flowElements: ["bpmn:Task"] }, references: {} },
  "bpmn:Task": { id: true, scalars: ["id", "name"], containment: {}, references: {} },
} });
const aidRecognition = { op: "textPrefix",
  value: { op: "read", binding: "self", path: "/text" }, prefix: "[Aid]", trim: "none" };
const aidNotions = { aid: { recognition: aidRecognition } };
const strictTree = { $type: "bpmn:Definitions", id: "D",
  rootElements: [{ $type: "bpmn:Process", id: "P",
    flowElements: [{ $type: "bpmn:Task", id: "T", name: "x" }] }] };
const strictTask = strictTree.rootElements[0].flowElements[0];

test("G4 core recognizes refusal is a non-match", () => {
  const outcome = evaluatePredicate({ op: "recognizes", binding: "self", notion: "aid" },
    { descriptors: synthetic, tree: strictTree,
      bindings: { self: { node: strictTask, pointer: "" } }, notions: aidNotions });
  assert.equal(outcome.status, "ok");
  assert.equal(outcome.payload, false);
});

test("G4 core surfaces errors outside recognition", () => {
  const outcome = evaluatePredicate(
    { op: "equal", left: { op: "read", binding: "self", path: "/text" }, right: { op: "literal", value: "x" } },
    { descriptors: synthetic, tree: strictTree,
      bindings: { self: { node: strictTask, pointer: "" } }, notions: aidNotions });
  assert.equal(outcome.status, "refused");
  assert.equal(outcome.code, "profile-type");
});

const fixtureRoot = new URL("./fixtures/profile-parity-corpus/profile-mechanism/1/", import.meta.url);
const profileBytes = readFileSync(new URL("neutral-profile.json", fixtureRoot));
const descriptorBytes = readFileSync(new URL("neutral-descriptors.json", fixtureRoot));

async function setupProfile(ruleAssert) {
  const api = await import("../dist/profile/index.js");
  const inputs = compilerInputs();
  const document = JSON.parse(profileBytes.toString());
  for (const table of document.validation) {
    table.extends = [];
    table.settings = [
      ...recommendedRuleNames().map((rule) => table.settings.find((s) => s.rule === rule && rule === "label-required")
        ?? { rule, severity: "off", classification: "integrity" }),
      ...table.settings.filter((s) => s.rule.startsWith("profile:")),
    ];
  }
  document.notions[0].recognition = { op: "present", value: { op: "id", binding: "self" } };
  for (const rule of document.rules) {
    if (rule.id !== "task-named-pre-normalize") continue;
    rule.select = { from: "root", via: "all", where: { op: "true" }, order: "id" };
    rule.assert = ruleAssert;
  }
  const validated = api.loadProfile(JSON.stringify(document), inputs);
  assert.equal(validated.status, "ok", validated.code);
  const groups = {
    "predicates/1": ["literal", "read", "id", "ids", "param", "concat", "stripPrefix", "case", "outputId", "true", "false", "all", "any", "not", "typeIs", "present", "equal", "textPrefix", "boundRole", "recognizes"],
    "selectors/1": ["count", "reachable"],
    "recipes/1": ["bind", "create", "ensure", "set", "unset", "assignRef", "reparent", "place", "remove", "refuse"],
    "export-ir/1": ["emit", "loss"],
  };
  const signatures = Object.fromEntries(Object.entries(groups)
    .flatMap(([capability, ops]) => ops.map((op) => [op, { capability, version: "1", argumentSchemaDigest: "0".repeat(64) }])));
  const compiled = api.compileProfile(validated.payload, { ...compilerRegistry(), capabilities: document.capabilities, signatures,
    descriptors: JSON.parse(descriptorBytes.toString()).types,
    codecConfiguration: { contractVersion: "1", defaults: "explicit", descriptors: {} } });
  assert.equal(compiled.status, "ok", compiled.code);
  const tree = { $type: "bpmn:Definitions", id: "D", targetNamespace: "urn:neutral:test",
    rootElements: [{ $type: "bpmn:Process", id: "P", name: "Process",
      flowElements: [{ $type: "bpmn:Task", id: "T" }],
      documentation: [{ $type: "bpmn:Documentation", text: "d" }] }] };
  const envelope = { documentVersion: "1", profileIdentity: compiled.payload.identity, tree, bindings: [],
    semanticRevision: api.semanticRevision(tree, compiled.payload.identity, []) };
  return { api, document, compiled: compiled.payload, tree, envelope };
}

test("G4 lint treats refused recognition as a finding, not lint-rule-error", async () => {
  const { api, compiled, envelope } = await setupProfile({ op: "recognizes", binding: "self", notion: "task" });
  const result = api.validate(compiled, envelope, { phase: "pre-normalize", readinessPolicy: "draft" });
  assert.equal(result.status, "ok", result.code);
  const entries = result.report.entries;
  assert.ok(entries.some((entry) => entry.ruleId === "task-named-pre-normalize"));
  assert.ok(entries.every((entry) => entry.code !== "lint-rule-error"));
});

test("G4 lint still reports lint-rule-error outside recognition", async () => {
  const { api, compiled, envelope } = await setupProfile({ op: "present", value: { op: "id", binding: "self" } });
  const result = api.validate(compiled, envelope, { phase: "pre-normalize", readinessPolicy: "draft" });
  assert.equal(result.status, "refused");
  assert.equal(result.code, "lint-rule-error");
});

test("G4 export treats refused recognition as a non-match", () => {
  const evalBase = lot4EvalContext({ descriptors: synthetic, notions: aidNotions },
    strictTree, { node: strictTree, pointer: "" }, []);
  const scope = { occurrences: [], pages: [], semanticOf: () => undefined, childrenOf: () => [],
    evalBase, bound: { self: strictTask } };
  assert.equal(testOccurrencePredicate({ op: "recognizes", binding: "self", notion: "aid" }, scope), false);
});

test("G4 export surfaces errors outside recognition", () => {
  const evalBase = lot4EvalContext({ descriptors: synthetic, notions: aidNotions },
    strictTree, { node: strictTree, pointer: "" }, []);
  const scope = { occurrences: [], pages: [], semanticOf: () => undefined, childrenOf: () => [],
    evalBase, bound: { self: strictTask } };
  assert.throws(() => testOccurrencePredicate({ op: "recognizes", binding: "self", notion: "ghost" }, scope),
    (error) => (error?.code ?? "") === "profile-symbol");
});

test("G4 UI treats refused recognition as a non-match", async () => {
  const { document, compiled, tree } = await setupProfile({ op: "recognizes", binding: "self", notion: "task" });
  const view = viewOf(document, compiled, JSON.parse(descriptorBytes.toString()).types);
  const index = new TreeIndex(tree);
  const rootHandle = { node: tree, pointer: "" };
  const docNode = tree.rootElements[0].documentation[0];
  const docScope = scopeOf(view, tree, index,
    { root: rootHandle, self: { node: docNode, pointer: "/rootElements/0/documentation/0" } }, []);
  assert.deepEqual(recognizedNotions(view, docScope), []);
  const taskNode = tree.rootElements[0].flowElements[0];
  const taskScope = scopeOf(view, tree, index,
    { root: rootHandle, self: { node: taskNode, pointer: "/rootElements/0/flowElements/0" } }, []);
  assert.deepEqual(recognizedNotions(view, taskScope), ["task"]);
});
