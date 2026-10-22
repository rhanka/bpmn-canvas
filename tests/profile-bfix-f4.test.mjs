import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileByPath, lot3Compile } from "./helpers/lot3-compile.mjs";
import { normalize } from "../dist/profile/normalize.js";
import { complete } from "../dist/profile/completion.js";
import { semanticRevision } from "../dist/profile/envelope.js";
import { canonicalize } from "../dist/profile/canonical.js";
import { evaluatePredicate, HOST_RESOURCE_LIMITS } from "../dist/profile/compiler.js";
import { validate } from "../dist/profile/validate.js";
import { importProjection } from "../dist/profile/import.js";
import { canonicalDigest } from "../dist/profile/canonical.js";
import { navigateCall } from "../dist/profile/lot5-queries.js";
import { Applier } from "../dist/profile/planning.js";
import { descriptorIndex } from "../dist/profile/native-contracts.js";

const casesDir = new URL("./fixtures/lot3-cn/expectations/cases/", import.meta.url);
const caseOf = (id) => JSON.parse(readFileSync(new URL(`./${id}.json`, casesDir), "utf8"));
const input = (c, role) => structuredClone(c.inputArtifacts.find((a) => a.role === role)?.json);
const rebind = (envelope, identity) => ({ ...structuredClone(envelope), profileIdentity: identity,
  semanticRevision: semanticRevision(envelope.tree, identity, envelope.bindings ?? []) });

// Finding #8: two distinct place plans for one target/region refuse
// profile-write-conflict; identical plans coalesce.
test("f4-08 conflicting place plans refuse profile-write-conflict", async () => {
  const c = caseOf("l3-n-shared-item-anchor");
  const env0 = input(c, "envelope"), activation = input(c, "activation");
  const { compiled: base } = await compileByPath(c.profileArtifact.path);
  const r0 = await normalize(base.payload, env0, activation, undefined);
  assert.equal(r0.status, "ok");
  const placed = r0.payload.placements[0];
  const { compiled } = await lot3Compile("main", (profile) => {
    const recipes = profile.recipes.filter((r) => r.phase === "normalize"
      && (r.steps ?? []).some((s) => s.op === "place" && s.region === placed.regionKey));
    for (const recipe of recipes) {
      const twin = structuredClone(recipe);
      twin.id = `${recipe.id}-twin`;
      const place = twin.steps.find((s) => s.op === "place");
      delete place.anchor;
      place.related = { from: "root", all: undefined, via: "all", where: { op: "false" }, order: "id" };
      profile.recipes.push(twin);
    }
  });
  assert.equal(compiled.status, "ok");
  const env = rebind(env0, compiled.payload.identity);
  const r = await normalize(compiled.payload, env, activation, undefined);
  assert.equal(r.status, "refused");
  assert.equal(r.code, "profile-write-conflict");
});

test("f4-08 identical place plans coalesce", async () => {
  const c = caseOf("l3-n-shared-item-anchor");
  const env0 = input(c, "envelope"), activation = input(c, "activation");
  const { compiled: base } = await compileByPath(c.profileArtifact.path);
  const r0 = await normalize(base.payload, env0, activation, undefined);
  assert.equal(r0.status, "ok");
  const placed = r0.payload.placements[0];
  const { compiled } = await lot3Compile("main", (profile) => {
    const recipes = profile.recipes.filter((r) => r.phase === "normalize"
      && (r.steps ?? []).some((s) => s.op === "place" && s.region === placed.regionKey));
    for (const recipe of recipes) {
      const twin = structuredClone(recipe);
      twin.id = `${recipe.id}-twin`;
      profile.recipes.push(twin);
    }
  });
  assert.equal(compiled.status, "ok");
  const env = rebind(env0, compiled.payload.identity);
  const r = await normalize(compiled.payload, env, activation, undefined);
  assert.equal(r.status, "ok");
  const same = (r.payload?.placements ?? []).filter((p) =>
    p.elementId === placed.elementId && p.regionKey === placed.regionKey);
  assert.equal(same.length, 1);
});

// Finding #9: appendUnique deltas coalesce canonically, independent of recipe order.
const laneTree = () => ({ $type: "bpmn:Definitions", id: "D", rootElements: [{ $type: "bpmn:Process", id: "P",
  laneSets: [{ $type: "bpmn:LaneSet", id: "LS", lanes: [{ $type: "bpmn:Lane", id: "L", flowNodeRef: ["t0"] }] }],
  flowElements: [{ $type: "bpmn:Task", id: "t0" }, { $type: "bpmn:Task", id: "a" }, { $type: "bpmn:Task", id: "c" }] }] });
const appendWrite = (recipeId, ids) => ({ op: "assignRef", recipeId, target: { id: "L" }, property: "flowNodeRef",
  mode: "appendUnique", ids, cardinality: "many", targetTypes: ["bpmn:Task"] });
const laneRefOf = (ap) => ap.tree.rootElements[0].laneSets[0].lanes[0].flowNodeRef;

test("f4-09 appendUnique order independent canonical append", () => {
  const ap = new Applier(structuredClone(laneTree()), []);
  ap.applyWrites([appendWrite("r1", ["c"]), appendWrite("r2", ["a"])], [false, false]);
  const first = laneRefOf(ap);
  const ap2 = new Applier(structuredClone(laneTree()), []);
  ap2.applyWrites([appendWrite("r2", ["a"]), appendWrite("r1", ["c"])], [false, false]);
  const second = laneRefOf(ap2);
  assert.deepEqual(first, ["t0", "a", "c"]);
  assert.deepEqual(second, ["t0", "a", "c"]);
});

test("f4-09 append and remove deltas coalesce by id", () => {
  const tree = laneTree();
  tree.rootElements[0].laneSets[0].lanes[0].flowNodeRef = ["t0", "b"];
  tree.rootElements[0].flowElements.push({ $type: "bpmn:Task", id: "b" });
  const removeWrite = (recipeId, ids) => ({ op: "assignRef", recipeId, target: { id: "L" }, property: "flowNodeRef",
    mode: "remove", ids, cardinality: "many", targetTypes: ["bpmn:Task"] });
  const ap = new Applier(structuredClone(tree), []);
  ap.applyWrites([appendWrite("r1", ["c"]), removeWrite("r2", ["b"])], [false, false]);
  const ap2 = new Applier(structuredClone(tree), []);
  ap2.applyWrites([removeWrite("r2", ["b"]), appendWrite("r1", ["c"])], [false, false]);
  assert.deepEqual(laneRefOf(ap), ["t0", "c"]);
  assert.deepEqual(laneRefOf(ap2), ["t0", "c"]);
});

// Finding #10: assignRef endpoint typing admits inheritance.
const xDescriptors = () => descriptorIndex({ types: {
  "x:Root": { id: true, scalars: ["id"], containment: { items: ["x:Leaf", "x:Holder"] }, references: {} },
  "x:Base": { id: true, scalars: ["id"], containment: {}, references: {} },
  "x:Leaf": { id: true, scalars: ["id"], containment: {}, references: {}, extends: ["x:Base"] },
  "x:Holder": { id: true, scalars: ["id"], containment: {}, references: { ref: ["x:Base"] } },
} });
const xTree = () => ({ $type: "x:Root", id: "R",
  items: [{ $type: "x:Leaf", id: "leaf" }, { $type: "x:Holder", id: "h" }] });

test("f4-10 assignRef accepts subtype endpoint", () => {
  const ap = new Applier(structuredClone(xTree()), [], xDescriptors());
  ap.applyWrites([{ op: "assignRef", recipeId: "r", target: { id: "h" }, property: "ref",
    mode: "replace", ids: ["leaf"], cardinality: "single", targetTypes: ["x:Base"] }], [true]);
  assert.equal(ap.tree.items[1].ref, "leaf");
});

test("f4-10 assignRef still refuses unrelated endpoint", () => {
  const ap = new Applier(structuredClone(xTree()), [], xDescriptors());
  assert.throws(() => ap.applyWrites([{ op: "assignRef", recipeId: "r", target: { id: "h" }, property: "ref",
    mode: "replace", ids: ["R"], cardinality: "single", targetTypes: ["x:Base"] }], [true]),
  (error) => error.code === "profile-type");
});

// Finding #11: extraction checks actor authority member by member, not only
// at profile level. Process.isExecutable is editor-only in the base fixture.
test("f4-11 extraction refuses a non-AI member", async () => {
  const c = caseOf("l3-c-extraction-authorized");
  const env0 = input(c, "envelope"), mode = input(c, "mode"), activation = input(c, "activation");
  const { compiled } = await compileByPath(c.profileArtifact.path);
  assert.equal(compiled.status, "ok");
  const env = structuredClone(env0);
  env.tree.rootElements.find((n) => n.$type === "bpmn:Process").isExecutable = true;
  env.semanticRevision = semanticRevision(env.tree, env.profileIdentity, env.bindings ?? []);
  const r = await complete(compiled.payload, env, mode, activation);
  assert.equal(r.status, "refused");
  assert.equal(r.code, "profile-producer");
});

test("f4-11 extraction rerun on C output stays ok", async () => {
  const c = caseOf("l3-c-extraction-authorized");
  const env0 = input(c, "envelope"), mode = input(c, "mode"), activation = input(c, "activation");
  const { compiled } = await compileByPath(c.profileArtifact.path);
  assert.equal(compiled.status, "ok");
  const r1 = await complete(compiled.payload, env0, mode, activation);
  assert.equal(r1.status, "ok");
  const r2 = await complete(compiled.payload, r1.payload, mode, activation);
  assert.equal(r2.status, "ok");
  assert.equal(canonicalize(r2.payload.tree), canonicalize(r1.payload.tree));
});

// Finding #12: the shared evaluator. present() is false only for MISSING,
// a missing id is an evaluation error, read() traverses known single
// containment only, and ambiguous support ownership refuses.
const evalDescriptors = () => descriptorIndex({ types: {
  "bpmn:Definitions": { id: true, scalars: ["id"], containment: { rootElements: ["bpmn:Process"] }, references: {} },
  "bpmn:Process": { id: true, scalars: ["id", "name"], containment: { flowElements: ["bpmn:Task"], documentation: ["bpmn:Documentation"] }, references: {} },
  "bpmn:Task": { id: true, scalars: ["id", "name"], containment: {}, references: {} },
  "bpmn:Documentation": { id: false, scalars: ["text"], containment: {}, references: {} },
} });
const evalTree = () => ({ $type: "bpmn:Definitions", id: "D", rootElements: [{ $type: "bpmn:Process", id: "P",
  flowElements: [{ $type: "bpmn:Task", id: "T", name: "n" }],
  documentation: [{ $type: "bpmn:Documentation", text: "d" }] }] });
const evalCtx = (tree, bindings, supportBindings = []) =>
  ({ descriptors: evalDescriptors(), tree, bindings, supportBindings });

test("f4-12 present propagates evaluation errors", () => {
  const tree = evalTree();
  const ctx = evalCtx(tree, { root: { node: tree, pointer: "" } });
  const bad = { op: "concat", values: [{ op: "literal", value: "a" }, { op: "literal", value: 1 }] };
  const r = evaluatePredicate({ op: "present", value: bad }, ctx);
  assert.equal(r.status, "refused");
  assert.equal(r.code, "profile-type");
});

test("f4-12 missing id is an evaluation error", () => {
  const tree = evalTree();
  const doc = tree.rootElements[0].documentation[0];
  const ctx = evalCtx(tree, { root: { node: tree, pointer: "" }, self: { node: doc, pointer: "/rootElements/0/documentation/0" } });
  const r = evaluatePredicate({ op: "present", value: { op: "id", binding: "self" } }, ctx);
  assert.equal(r.status, "refused");
});

test("f4-12 read refuses array traversal and indexing", () => {
  const tree = evalTree();
  const proc = tree.rootElements[0];
  const ctx = evalCtx(tree, { root: { node: tree, pointer: "" }, self: { node: proc, pointer: "/rootElements/0" } });
  const viaArray = evaluatePredicate(
    { op: "present", value: { op: "read", binding: "self", path: "/flowElements/name" } }, ctx);
  assert.equal(viaArray.status, "refused");
  const viaIndex = evaluatePredicate(
    { op: "present", value: { op: "read", binding: "self", path: "/flowElements/0/name" } }, ctx);
  assert.equal(viaIndex.status, "refused");
});

test("f4-12 boundRole refuses ambiguous ownership", () => {
  const tree = evalTree();
  const proc = tree.rootElements[0];
  const base = { root: { node: tree, pointer: "" }, self: { node: proc, pointer: "/rootElements/0" } };
  const one = evalCtx(tree, base, [{ ownerId: "P0", role: "band", targetId: "P" }]);
  assert.equal(evaluatePredicate({ op: "boundRole", binding: "self", owner: "bindingOwner", role: "band" }, one).payload, true);
  const none = evalCtx(tree, base, []);
  assert.equal(evaluatePredicate({ op: "boundRole", binding: "self", owner: "bindingOwner", role: "band" }, none).payload, false);
  const ambiguous = evalCtx(tree, base, [
    { ownerId: "P0", role: "band", targetId: "P" },
    { ownerId: "P1", role: "band", targetId: "P" },
  ]);
  const r = evaluatePredicate({ op: "boundRole", binding: "self", owner: "bindingOwner", role: "band" }, ambiguous);
  assert.equal(r.status, "refused");
  assert.equal(r.code, "support-binding-conflict");
});
test("f4-15 host resource limits are pinned", () => {
  assert.deepEqual({ ...HOST_RESOURCE_LIMITS }, {
    maxInputNodes: 10_000,
    maxInputBytes: 8_000_000,
    maxAstDepth: 256,
    maxSelected: 100_000,
    maxEvaluations: 1_000_000,
  });
});

test("f4-15 oversized input refuses resource-limit", async () => {
  const c = caseOf("l3-c-topology");
  const env0 = input(c, "envelope"), activation = input(c, "activation");
  const { compiled } = await compileByPath(c.profileArtifact.path);
  assert.equal(compiled.status, "ok");
  const env = structuredClone(env0);
  const proc = env.tree.rootElements.find((n) => n.$type === "bpmn:Process");
  proc.flowElements = [...(proc.flowElements ?? []), ...Array.from(
    { length: HOST_RESOURCE_LIMITS.maxInputNodes + 1 }, (_, i) => ({ $type: "bpmn:Task", id: `Zt_${i}`, name: `T${i}` }))];
  env.semanticRevision = semanticRevision(env.tree, env.profileIdentity, env.bindings ?? []);
  const r = await complete(compiled.payload, env, "retained", activation);
  assert.equal(r.status, "refused");
  assert.equal(r.code, "resource-limit");
});

test("f4-15 800 elements run inside the cost budget", async () => {
  const c = caseOf("l3-c-topology");
  const env0 = input(c, "envelope");
  const activation = "qualification";
  const { compiled } = await compileByPath(c.profileArtifact.path);
  assert.equal(compiled.status, "ok");
  const env = structuredClone(env0);
  const proc = env.tree.rootElements.find((n) => n.$type === "bpmn:Process");
  proc.flowElements = [...(proc.flowElements ?? []), ...Array.from(
    { length: 800 }, (_, i) => ({ $type: "bpmn:Task", id: `Zt_${i}`, name: `T${i}` }))];
  env.semanticRevision = semanticRevision(env.tree, env.profileIdentity, env.bindings ?? []);
  let start = performance.now();
  const cr = await complete(compiled.payload, env, "retained", activation);
  const completeMs = performance.now() - start;
  assert.equal(cr.status, "ok");
  start = performance.now();
  const nr = await normalize(compiled.payload, cr.payload, activation, undefined);
  const normalizeMs = performance.now() - start;
  assert.equal(nr.status, "ok");
  start = performance.now();
  const vr = validate(compiled.payload, cr.payload, { phase: "pre-normalize", readinessPolicy: "draft" });
  const validateMs = performance.now() - start;
  assert.equal(vr.status, "ok");
  assert.ok(completeMs < 10_000, `complete ${Math.round(completeMs)}ms`);
  assert.ok(normalizeMs < 10_000, `normalize ${Math.round(normalizeMs)}ms`);
  assert.ok(validateMs < 10_000, `validate ${Math.round(validateMs)}ms`);
});

// Finding #16: committed trees are DI-free; extracted presentation survives
// as importedDi and is never loss-reported; undecodable sources refuse
// operation-error instead of document-not-loaded.
test("f4-16 import extracts DI to importedDi without loss", async () => {
  const c = caseOf("l3-imp-projection-out-of-base");
  const { compiled } = await compileByPath(c.profileArtifact.path);
  assert.equal(compiled.status, "ok");
  const sourceArtifact = c.inputArtifacts.find((a) => a.role === "source");
  const source = JSON.parse(sourceArtifact.text);
  source.diagrams = [{ $type: "bpmn:BPMNDiagram", id: "Diagram_1",
    plane: { $type: "bpmn:BPMNPlane", id: "Plane_1", bpmnElement: "P",
      shapes: [{ $type: "bpmn:BPMNShape", id: "Shape_T1", bpmnElement: "T1" }] } }];
  const r = await importProjection(compiled.payload, JSON.stringify(source), "native-json");
  assert.equal(r.status, "ok");
  assert.ok(!Object.hasOwn(r.payload.tree, "diagrams"));
  assert.deepEqual(r.payload.importedDi.diagrams, source.diagrams);
  assert.equal(r.payload.importedDi.sha256,
    canonicalDigest({ descriptorDigest: r.payload.importedDi.descriptorDigest, diagrams: r.payload.importedDi.diagrams }));
  const diLosses = r.report.entries.filter((e) => e.code === "import-loss/unsupported-feature" &&
    (e.source.pointer ?? "").startsWith("/diagrams"));
  assert.deepEqual(diLosses, []);
});

test("f4-16 undecodable sources refuse operation-error", async () => {
  const c = caseOf("l3-imp-projection-out-of-base");
  const { compiled } = await compileByPath(c.profileArtifact.path);
  assert.equal(compiled.status, "ok");
  const xml = await importProjection(compiled.payload, "<definitions/>", "bpmn-xml");
  assert.equal(xml.status, "refused");
  assert.equal(xml.code, "operation-error");
  const garbage = await importProjection(compiled.payload, "not json", "native-json");
  assert.equal(garbage.status, "refused");
  assert.equal(garbage.code, "operation-error");
});

// Finding #24: envelope shape violations refuse profile-schema; the complete
// mode vocabulary is closed ({extraction, retained}) with retained default.
test("f4-24 malformed envelopes refuse profile-schema", async () => {
  const c = caseOf("l3-c-topology");
  const { compiled } = await compileByPath(c.profileArtifact.path);
  assert.equal(compiled.status, "ok");
  for (const bad of [42, { documentVersion: "1" }, { documentVersion: "1", profileIdentity: {}, tree: {}, semanticRevision: "x" }]) {
    const r = await complete(compiled.payload, bad, "retained", "qualification");
    assert.equal(r.status, "refused");
    assert.equal(r.code, "profile-schema");
  }
});

test("f4-24 complete mode vocabulary is closed", async () => {
  const c = caseOf("l3-c-topology");
  const env0 = input(c, "envelope");
  const { compiled } = await compileByPath(c.profileArtifact.path);
  assert.equal(compiled.status, "ok");
  const legacy = await complete(compiled.payload, env0, "default", "qualification");
  assert.equal(legacy.status, "refused");
  assert.equal(legacy.code, "operation-error");
  const fallback = await complete(compiled.payload, env0, undefined, "qualification");
  assert.equal(fallback.status, "ok");
});

// Finding #27: navigateCall distinguishes empty, absent, dangling and
// wrong-type call targets.
test("f4-27 navigateCall target codes", () => {
  const tree = { $type: "bpmn:Definitions", id: "D", rootElements: [
    { $type: "bpmn:Process", id: "P", flowElements: [
      { $type: "bpmn:CallActivity", id: "C_absent" },
      { $type: "bpmn:CallActivity", id: "C_empty", calledElement: "" },
      { $type: "bpmn:CallActivity", id: "C_dangling", calledElement: "Nope" },
      { $type: "bpmn:CallActivity", id: "C_wrong", calledElement: "G" },
      { $type: "bpmn:CallActivity", id: "C_ok", calledElement: "Q" },
    ] },
    { $type: "bpmn:Process", id: "Q" },
    { $type: "bpmn:GlobalTask", id: "G" },
  ] };
  const byId = new Map();
  const walk = (n) => {
    if (n && typeof n === "object") {
      if (typeof n.$type === "string" && typeof n.id === "string") byId.set(n.id, { node: n });
      for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(walk); else walk(v); }
    }
  };
  walk(tree);
  const pages = [{ diagramId: "diag", semanticRootId: "Q", name: "Q", order: 0 }];
  const nav = (callId) => navigateCall(pages, "r", tree, byId, callId, undefined, undefined);
  assert.equal(nav("C_absent").code, "call-target-required");
  assert.equal(nav("C_empty").code, "call-target-empty");
  assert.equal(nav("C_dangling").code, "reference-dangling");
  assert.equal(nav("C_wrong").code, "call-target-type");
  assert.equal(nav("C_ok").status, "ok");
});

