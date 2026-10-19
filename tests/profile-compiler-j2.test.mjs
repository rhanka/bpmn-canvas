import { test } from "node:test";
import assert from "node:assert/strict";
import { loadProfile, compileProfile, evaluatePredicate, evaluateValue, selectHandles } from "../dist/profile/compiler.js";
import { canonicalDigest, rawDigest } from "../dist/profile/canonical.js";
import { profileIdentity, semanticRevision, validateEnvelope } from "../dist/profile/envelope.js";
import { createDescriptorContext, requireSingleContext } from "../dist/profile/descriptor-context.js";
import { compilerInputs, compilerRegistry, mechanism, mechanismBytes } from "./helpers/compiler-fixture.mjs";

const literal = value => ({ op: "literal", value });
const selector = (from = "root", via = "all", where = { op: "true" }, order = "id") => ({ from, via, where, order });
async function loaded(mutate = () => {}, inputs = compilerInputs()) {
  const profile = mechanism("neutral-profile.json");
  mutate(profile);
  const result = await loadProfile(JSON.stringify(profile), inputs);
  assert.equal(result.status, "ok", result.code);
  return result.payload;
}
async function rejectsCompile(mutate, code, registry = compilerRegistry(), inputs = compilerInputs()) {
  const result = await compileProfile(await loaded(mutate, inputs), registry);
  assert.equal(result.status, "refused", `expected ${code}`);
  assert.equal(result.code, code);
}

test("J2 #2 CR-01 rejects unknown and duplicate capabilities", async () => {
  for (const id of ["unknown/1", "predicates/1"]) {
    const p = mechanism("neutral-profile.json"); p.capabilities.push(id);
    assert.equal((await loadProfile(JSON.stringify(p), compilerInputs())).code, "profile-schema");
  }
  const registry = compilerRegistry(); registry.capabilities = registry.capabilities.filter(c => c !== "render-data/1");
  await rejectsCompile(() => {}, "profile-capability", registry);
});
test("J2 #2 CR-02 rejects numeric concat through the complete compiler", async () => {
  await rejectsCompile(p => { p.notions[1].recognition.args[1].value = { op: "concat", values: [literal(1)] }; }, "profile-type");
});
test("J2 #2 CR-03 rejects native page order and bad reference traversal", async () => {
  await rejectsCompile(p => { p.rules[0].select = selector("root", "self", { op: "true" }, "page-occurrence"); }, "profile-selector-order");
  await rejectsCompile(p => { p.rules[0].select = { ...selector("root", "reference"), property: "name" }; }, "profile-selector-property");
});
for (const ast of [{ op: "count", select: selector(), min: 2, max: 1 }, { op: "reachable", from: selector(), to: selector(), edgeTypes: ["bpmn:SequenceFlow"], minHops: 2, maxHops: 1 }]) {
  test(`J2 #2 CR-04 checks ${ast.op} bounds after schema admission`, async () => {
    const p = mechanism("neutral-profile.json"); p.rules[0].assert = ast;
    const result = await loadProfile(JSON.stringify(p), compilerInputs());
    assert.equal(result.status, "ok", result.code);
    const compiled = await compileProfile(result.payload, compilerRegistry());
    assert.equal(compiled.status, "refused");
    assert.equal(compiled.code, "profile-bounds");
  });
}
for (const [name, mutate] of [
  ["ghost binding", p => { p.rules[0].assert = { op: "present", value: { op: "id", binding: "ghost" } }; }],
  ["message", p => { p.rules[0].message = "missing"; }],
  ["glyph", p => { p.notions[0].renderBindings[0].glyph = "missing"; }],
  ["resource", p => { p.themes[0].metricsResource = "missing"; }],
  ["theme duplicate", p => { p.themes.push(structuredClone(p.themes[0])); }],
  ["forward binding", p => { p.recipes[4].steps.reverse(); }],
]) test(`J2 #2 CR-05 rejects ${name}`, () => rejectsCompile(mutate, "profile-symbol"));
test("J2 #2 CR-06 applies the pinned producer delta", async () => {
  const inputs = compilerInputs();
  const base = JSON.parse(inputs.baseBytes);
  base.fields.find(f => f.type === "bpmn:Process" && f.field === "isExecutable").producers = ["editor", "import"];
  inputs.baseBytes = Buffer.from(JSON.stringify(base));
  inputs.basePin.sha256 = await rawDigest(inputs.baseBytes);
  const delta = { nativeType: "bpmn:Process", path: "/isExecutable", from: "import", to: "code", reason: "generated default" };
  const change = p => { p.base.sha256 = inputs.basePin.sha256; p.producerDelta = [delta]; };
  const admitted = await compileProfile(await loaded(change, inputs), compilerRegistry());
  assert.equal(admitted.status, "ok", admitted.code);
  await rejectsCompile(p => { change(p); p.producerDelta = []; }, "profile-producer", compilerRegistry(), inputs);
});
test("J2 #2 CR-07 rejects containment identity on an ID-bearing task", async () => {
  await rejectsCompile(p => { const s = p.recipes[0].steps[0]; s.identity = "containment"; delete s.ownerId; delete s.key; delete s.slot; }, "profile-create-identity");
});
test("J2 #2 CR-08 refuses missing validation coverage", async () => {
  await rejectsCompile(p => { p.validation.pop(); }, "lint-config-incomplete");
});
test("J2 #2 CR-08 resolves only allowlisted acyclic lint configurations", async () => {
  await rejectsCompile(p => { p.validation[0].extends = ["plugin:unknown/config"]; }, "lint-config-unknown");
  const registry = compilerRegistry(); registry.lintConfigs["bpmnlint:recommended"] = { extends: ["bpmnlint:recommended"] };
  await rejectsCompile(() => {}, "lint-config-cycle", registry);
});
test("J2 #2 CR-09 checks theme token types and binding uniqueness", async () => {
  await rejectsCompile(p => { p.notions[0].renderBindings[0].tokens[0].value = 12; }, "profile-type");
  await rejectsCompile(p => { p.notions[0].renderBindings.push(structuredClone(p.notions[0].renderBindings[0])); }, "profile-type");
});
test("J2 #2 CR-10 requires typed UI recipe arguments", async () => {
  await rejectsCompile(p => { p.ui[0].parameters.pop(); }, "profile-ui-parameters");
  await rejectsCompile(p => { p.ui[0].parameters[0].source = "value"; }, "profile-type");
});
test("J2 #2 CR-11 rejects numeric export IDs", async () => {
  await rejectsCompile(p => { p.recipes.find(r => r.id === "export-pages").steps[0].fields[0].value = literal(12); }, "profile-export-field");
});
test("J2 #2 CR-12 rejects a migration to its own source", async () => {
  await rejectsCompile(p => { p.migrations[0].from = { id: p.profile, version: p.version, sha256: "0".repeat(64) }; }, "profile-migration-endpoint");
});
test("J2 #2 CR-13 preserves the fallback refusal at schema admission", async () => {
  const p = mechanism("neutral-profile.json");
  p.recipes[4].steps[0].fallbacks = [];
  assert.equal((await loadProfile(JSON.stringify(p), compilerInputs())).code, "profile-bind-fallbacks");
});
test("J2 #2 CR-14 preserves the action phase refusal at schema admission", async () => {
  const p = mechanism("neutral-profile.json");
  p.recipes[0].phase = "export";
  assert.equal((await loadProfile(JSON.stringify(p), compilerInputs())).code, "profile-action-phase");
});
test("J2 #2 rejects an empty descriptor registry", async () => {
  const result = await compileProfile(await loaded(), { ...compilerRegistry(), descriptors: {} });
  assert.equal(result.status, "refused");
  assert.equal(result.code, "descriptor-mismatch");
});
test("J2 #2 CR-01 requires exact admitted registry signatures", async () => {
  const registry = compilerRegistry(); registry.signatures.concat.argumentSchemaDigest = "f".repeat(64);
  await rejectsCompile(() => {}, "profile-capability", registry);
});
for (const [name, mutate, code] of [
  ["unknown field path", p => { p.notions[0].recognition = { op: "present", value: { op: "read", binding: "self", path: "/unknown" } }; }, "profile-type"],
  ["unknown parameter", p => { p.recipes[0].steps[0].fields[0].value = { op: "param", name: "ghost" }; }, "profile-symbol"],
  ["repair recipe", p => { p.rules[0].repairRecipe = "missing"; }, "profile-symbol"],
  ["theme fallback cycle", p => { p.themes[0].fallback = p.themes[0].id; }, "profile-cycle"],
  ["glyph dimensions", p => { p.themes[0].glyphs[0].viewBox[2] = 0; }, "profile-glyph-shape"],
  ["duplicate message name", p => { p.messages[0].texts.push(structuredClone(p.messages[0].texts[0])); }, "profile-symbol"],
  ["bad alias destination", p => { p.compatibilityAliases.push({ kind: "theme", old: "legacy", destination: "missing", mode: "explicit-adapter" }); }, "profile-symbol"],
  ["typed render traversal", p => { p.recipes.find(r => r.id === "export-pages").select = selector("render", "root"); }, "profile-type"],
  ["native predicate on render handle", p => { p.recipes.find(r => r.id === "export-pages").when = { op: "typeIs", binding: "self", type: "bpmn:Task", mode: "exact" }; }, "profile-type"],
]) test(`J2 #2 checks ${name} throughout the profile`, () => rejectsCompile(mutate, code));
test("J2 #3 rejects a registry rule-table mismatch", async () => {
  const registry = compilerRegistry(); registry.compilerRuleTable = { ...registry.compilerRuleTable, revision: "other" };
  assert.equal((await compileProfile(await loaded(), registry)).code, "profile-capability");
});
test("J2 #3 rejects descriptor byte and identity drift", async () => {
  for (const change of [i => { i.descriptorPins[0].descriptorBytes = Buffer.from("{}"); }, i => { i.descriptorPins[0].version = "other"; }]) {
    const inputs = compilerInputs(); change(inputs);
    assert.equal((await loadProfile(mechanismBytes("neutral-profile.json"), inputs)).code, "descriptor-mismatch");
  }
});
test("J2 #3 snapshots schema bytes before asynchronous digest checks", async () => {
  const inputs = compilerInputs(); inputs.schemaBytes = Buffer.from(inputs.schemaBytes);
  const p = mechanism("neutral-profile.json"); p.extra = true;
  const pending = loadProfile(JSON.stringify(p), inputs);
  inputs.schemaBytes.fill(32); inputs.schemaBytes.write("true");
  assert.equal((await pending).code, "profile-schema");
});
test("J2 #4 snapshots descriptor bytes before asynchronous admission", async () => {
  const descriptorBytes = Buffer.from(mechanismBytes("neutral-descriptors.json"));
  const pin = { id: "neutral-descriptors/1", version: "fixture-2", sha256: await rawDigest(descriptorBytes), descriptorBytes };
  const pending = createDescriptorContext([pin]);
  descriptorBytes.set(Buffer.from(descriptorBytes.toString().replaceAll("bpmn:Task", "bpmn:Tasq")));
  const result = await pending;
  assert.equal(result.status, "ok");
  assert.equal(Object.hasOwn(result.payload.descriptors, "bpmn:Task"), true);
  assert.equal(Object.hasOwn(result.payload.descriptors, "bpmn:Tasq"), false);
});
test("J2 #2 keeps unrelated schema errors ahead of specialized static codes", async () => {
  for (const damage of [p => { p.recipes = [null]; }, p => { p.recipes[0].phase = "export"; p.recipes[0].steps[0].extra = true; }]) {
    const p = mechanism("neutral-profile.json"); damage(p);
    assert.equal((await loadProfile(JSON.stringify(p), compilerInputs())).code, "profile-schema");
  }
});

test("J2 #3 refuses forged base and descriptor pins", async () => {
  for (const mutate of [p => { p.base.sha256 = "f".repeat(64); }, p => { p.descriptors[0].sha256 = "f".repeat(64); }]) {
    const p = mechanism("neutral-profile.json"); mutate(p);
    assert.equal((await loadProfile(JSON.stringify(p), compilerInputs())).status, "refused");
  }
});
test("J2 #3 refuses a substituted schema and rule table", async () => {
  const p = mechanism("neutral-profile.json"); p.extra = true;
  assert.equal((await loadProfile(JSON.stringify(p), { ...compilerInputs(), schemaBytes: Buffer.from("true") })).status, "refused");
  assert.equal((await loadProfile(mechanismBytes("neutral-profile.json"), { ...compilerInputs(), compilerRuleTable: { format: "profile-compiler-rule-table/2", revision: "other" } })).status, "refused");
});
test("J2 #3 verifies bytes and declared digest domains", async () => {
  const inputs = compilerInputs(); inputs.baseBytes = Buffer.from("{}");
  assert.equal((await loadProfile(mechanismBytes("neutral-profile.json"), inputs)).status, "refused");
  const canonical = compilerInputs();
  canonical.basePin.digestDomain = "canonical";
  canonical.basePin.sha256 = await canonicalDigest(JSON.parse(canonical.baseBytes));
  const p = mechanism("neutral-profile.json"); p.base.sha256 = canonical.basePin.sha256;
  assert.equal((await loadProfile(JSON.stringify(p), canonical)).status, "ok");
});
test("J2 #4 deeply freezes validated and compiled identity data", async () => {
  const validated = await loaded();
  assert.throws(() => { validated.profile.notions[0].recognition.op = "false"; }, TypeError);
  assert.throws(() => { validated.identity.base.sha256 = "f".repeat(64); }, TypeError);
  const compiled = await compileProfile(validated, compilerRegistry());
  assert.equal(compiled.status, "ok", compiled.code);
  assert.throws(() => { compiled.payload.notions.task.recognition = { op: "false" }; }, TypeError);
});
test("J2 #4 refuses reconstructed validated profiles with stale identities", async () => {
  const validated = structuredClone(await loaded());
  validated.profile.notions[0].recognition = { op: "false" };
  assert.equal((await compileProfile(validated, compilerRegistry())).status, "refused");
});
test("J2 #4 deeply freezes descriptor authority and rejects forged contexts", async () => {
  const descriptorBytes = mechanismBytes("neutral-descriptors.json");
  const context = await createDescriptorContext([{ id: "neutral-descriptors/1", version: "fixture-2", sha256: await rawDigest(descriptorBytes), descriptorBytes }]);
  assert.equal(context.status, "ok");
  assert.throws(() => { context.payload.descriptors["bpmn:Task"].containment.extra = ["bpmn:Task"]; }, TypeError);
  assert.throws(() => requireSingleContext(context.payload, { ...context.payload, descriptors: {} }), /descriptor-mismatch/);
});

const descriptors = {
  "bpmn:Definitions": { id: true, scalars: ["id", "targetNamespace", "exporterVersion"], containment: { flowElements: ["bpmn:Task", "bpmn:SequenceFlow"] }, references: {} },
  "bpmn:Task": { id: true, scalars: ["id", "name", "calledElement"], containment: {}, references: {} },
  "bpmn:SequenceFlow": { id: true, scalars: ["id"], containment: {}, references: { sourceRef: ["bpmn:Task"], targetRef: ["bpmn:Task"] } },
};
const makeTree = (tasks, edges = []) => ({ $type: "bpmn:Definitions", id: "D", targetNamespace: "urn:test", exporterVersion: "1",
  flowElements: [...tasks.map(id => ({ $type: "bpmn:Task", id })), ...edges.map(([sourceRef, targetRef], i) => ({ $type: "bpmn:SequenceFlow", id: `F${i}`, sourceRef, targetRef }))] });
const context = tree => ({ tree, descriptors, bindings: { root: { node: tree, pointer: "" } } });
test("J2 #9 counts active AST depth separately from selected cardinality", () => {
  const c = context(makeTree(Array.from({ length: 300 }, (_, i) => `T${i}`)));
  assert.equal(selectHandles(selector(), c).status, "ok");
  assert.equal(selectHandles(selector(), { ...c, limits: { maxSelected: 300 } }).code, "resource-limit");
  let ast = { op: "true" }; for (let i = 0; i < 9; i++) ast = { op: "not", arg: ast };
  assert.equal(evaluatePredicate(ast, { ...c, limits: { maxAstDepth: 9 } }).code, "resource-limit");
  assert.equal(evaluatePredicate({ op: "all", args: Array.from({ length: 300 }, () => ({ op: "true" })) }, { ...c, limits: { maxAstDepth: 2 } }).status, "ok");
});
const reach = (minHops, maxHops, target = "T") => ({ op: "reachable", from: selector("a", "self"), to: selector("t", "self"), edgeTypes: ["bpmn:SequenceFlow"], minHops, maxHops });
test("J2 #10 finds longer admissible paths after a short visit", () => {
  const tree = makeTree(["A", "B", "T"], [["A", "T"], ["A", "B"], ["B", "T"]]);
  const c = context(tree); c.bindings.a = { node: tree.flowElements[0], pointer: "/flowElements/0" }; c.bindings.t = { node: tree.flowElements[2], pointer: "/flowElements/2" };
  assert.equal(evaluatePredicate(reach(2, 2), c).payload, true);
  assert.equal(evaluatePredicate(reach(3, 3), c).payload, false);
});
test("J2 #10 bounds cyclic reachability by node and hop state", () => {
  const tree = makeTree(["A", "B", "T"], [["A", "B"], ["B", "A"], ["A", "T"]]);
  const c = context(tree); c.bindings.a = { node: tree.flowElements[0], pointer: "/flowElements/0" }; c.bindings.t = { node: tree.flowElements[2], pointer: "/flowElements/2" };
  assert.equal(evaluatePredicate(reach(3, 3), c).payload, true);
  assert.equal(evaluatePredicate(reach(2, 2), c).payload, false);
});
test("J2 #11 refuses dangling references before predicate, selector and value evaluation", () => {
  const c = context(makeTree(["A", "T"], [["MISSING", "T"]]));
  for (const r of [evaluatePredicate({ op: "false" }, c), selectHandles(selector("root", "self"), c), evaluateValue(literal("ok"), c, "test")]) {
    assert.equal(r.status, "refused"); assert.equal(r.code, "reference-dangling");
  }
});
test("J2 #11 checks base-declared ID-valued scalars before evaluation", () => {
  const tree = makeTree(["A"]); tree.flowElements[0].calledElement = "MISSING";
  assert.equal(evaluatePredicate({ op: "true" }, { ...context(tree), idRefScalars: ["bpmn:Task.calledElement"] }).code, "reference-dangling");
});
test("J2 #11 refuses a dangling envelope with a valid revision", async () => {
  const tree = makeTree(["A", "T"], [["MISSING", "T"]]);
  const identity = await profileIdentity(mechanism("neutral-profile.json"));
  const e = { documentVersion: "1", profileIdentity: identity, tree, bindings: [], semanticRevision: await semanticRevision(tree, identity, []) };
  await assert.rejects(validateEnvelope(e, { syntax: () => ({ valid: true }), descriptors, supportRoles: [], storageValidator: () => true }), /reference-dangling/);
});
test("J2 #12 preserves BOM lexical parity for strings and bytes", async () => {
  for (const [text, code] of [["\ufeff" + mechanismBytes("neutral-profile.json"), "profile-json"], ["\ufeff{\"x\":1e400}", "profile-number"], ["\ufeff{\"x\":0,\"x\":1e400}", "profile-json-duplicate-key"], ["\ufeff{\"x\":\"\\ud800\"}", "profile-unicode"]]) {
    const a = await loadProfile(text, compilerInputs()), b = await loadProfile(Buffer.from(text), compilerInputs());
    assert.equal(a.code, code); assert.equal(b.status, a.status); assert.equal(b.code, a.code);
  }
});
