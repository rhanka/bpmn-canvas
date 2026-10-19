import { test } from "node:test";
import assert from "node:assert/strict";
import { BpmnModdle } from "bpmn-moddle";
import * as io from "../dist/io/index.js";
import { canon, configuration, freeze, localJson, snapshot } from "./helpers/workbench.mjs";

const task = (j) => j.rootElements[0].flowElements[1];
const flow = (j) => j.rootElements[0].flowElements[0];
const info = (j) => task(j).extensionElements.values[0];
function refusal(fn, code, path) {
  assert.throws(fn, (e) => e instanceof io.IoError && e.code === code && e.path === path);
}

test("F1 should expose separately callable hydrate and project", () => {
  assert.equal(typeof io.hydrate, "function"); assert.equal(typeof io.project, "function");
});
test("F1 should retain canonical JSON identity without XML", () => {
  const read = BpmnModdle.prototype.fromXML, write = BpmnModdle.prototype.toXML;
  BpmnModdle.prototype.fromXML = BpmnModdle.prototype.toXML = () => { throw Error("XML forbidden at F1"); };
  try { const j = localJson(); assert.equal(canon(io.project(io.hydrate(j, configuration), configuration)), canon(j)); }
  finally { BpmnModdle.prototype.fromXML = read; BpmnModdle.prototype.toXML = write; }
});
test("F1 should restore forward reference sharing, types and containment parents", () => {
  const m = io.hydrate(localJson(), configuration), p = m.rootElements[0], [f, t, s, e, last] = p.flowElements;
  assert.strictEqual(f.sourceRef, s); assert.strictEqual(f.targetRef, t);
  assert.strictEqual(t.incoming[0], f); assert.strictEqual(t.outgoing[0], last); assert.strictEqual(last.targetRef, e);
  assert.strictEqual(p.laneSets[0].lanes[0].flowNodeRef[0], t);
  assert.strictEqual(t.extensionElements.values[0].laneRef, p.laneSets[0].lanes[0]);
  assert.strictEqual(t.extensionElements.values[0].processRef, m.rootElements[1]);
  assert.strictEqual(m.diagrams[0].plane.planeElement[0].bpmnElement, t);
  assert.strictEqual(t.$parent, p); assert.strictEqual(t.extensionElements.$parent, t);
  assert.strictEqual(t.extensionElements.values[0].$parent, t.extensionElements);
  assert.equal(t.$instanceOf("bpmn:Activity"), true); assert.equal(m.$type, "bpmn:Definitions");
});
test("F1 should preserve all DI, sem fields, registered attributes and exact strings", () => {
  const j = localJson(), out = io.project(io.hydrate(j, configuration), configuration);
  assert.deepEqual(out.diagrams, j.diagrams); assert.deepEqual(out.$attrs, j.$attrs);
  assert.deepEqual(info(out), info(j)); assert.equal(task(out).name, task(j).name);
  assert.equal(out.rootElements.length, 2);
  assert.ok(!canon(out).includes("$parent")); assert.ok(!canon(out).includes("$descriptor"));
});
test("F1 should be a fixed point over three repeats and A B A fixtures", () => {
  const a = localJson(), b = localJson(); task(b).name = "Check lantern"; b.rootElements[0].flowElements.reverse();
  for (let i = 0; i < 3; i++) for (const j of [a, b, a]) {
    const q = io.project(io.hydrate(j, configuration), configuration);
    assert.equal(canon(q), canon(j)); assert.equal(canon(io.project(io.hydrate(q, configuration), configuration)), canon(q));
  }
});
test("F1 should leave frozen inputs/config unchanged and produce independent graphs", () => {
  const j = freeze(localJson()), before = canon(j), configBefore = canon(configuration);
  const m = io.hydrate(j, configuration), second = io.hydrate(j, configuration);
  const nativeBefore = snapshot(m); freeze(m);
  const out = io.project(m, configuration); task(out).name = "Changed output";
  assert.equal(snapshot(m), nativeBefore); assert.equal(canon(j), before); assert.equal(canon(configuration), configBefore);
  assert.notStrictEqual(m.rootElements[0], second.rootElements[0]);
});
test("F1 should retain array order while ignoring JSON key order", () => {
  const j = localJson(), reordered = JSON.parse(canon(j));
  assert.equal(canon(io.project(io.hydrate(reordered, configuration), configuration)), canon(j));
  j.diagrams[0].plane.planeElement[1].waypoint.reverse();
  assert.deepEqual(io.project(io.hydrate(j, configuration), configuration).diagrams, j.diagrams);
});
test("F1 should expand known defaults explicitly and distinguish absent/empty optional lists", () => {
  const j = localJson(); delete task(j).startQuantity; delete j.expressionLanguage;
  delete j.rootElements[1].flowElements;
  const q = io.project(io.hydrate(j, configuration), configuration);
  assert.equal(task(q).startQuantity, 1); assert.equal(q.expressionLanguage, "http://www.w3.org/1999/XPath");
  assert.ok(!Object.hasOwn(q.rootElements[1], "flowElements")); assert.deepEqual(q.rootElements[0].flowElements[2].incoming, []);
  assert.equal(canon(io.project(io.hydrate(q, configuration), configuration)), canon(q));
});
test("F1 should restore JSON after an ID-based edit and undo", () => {
  const j = localJson(), m = io.hydrate(j, configuration), t = m.rootElements[0].flowElements.find((e) => e.id === "Task_Fold"), old = t.name;
  t.name = "Edited"; assert.equal(task(io.project(m, configuration)).name, "Edited");
  t.name = old; assert.equal(canon(io.project(m, configuration)), canon(j));
});
test("F1 should not conflate explicit empty attrs with absent attrs", () => {
  const j = localJson(); task(j).$attrs = {};
  assert.deepEqual(task(io.project(io.hydrate(j, configuration), configuration)).$attrs, {});
  assert.ok(!Object.hasOwn(flow(io.project(io.hydrate(j, configuration), configuration)), "$attrs"));
});

const invalid = [
  ["duplicate IDs", (j) => { task(j).id = "Flow_First"; }, "duplicate-id", "$.rootElements[0].flowElements[1].id"],
  ["dangling refs", (j) => { flow(j).targetRef = "Missing"; }, "dangling-reference", "$.rootElements[0].flowElements[0].targetRef"],
  ["wrong typed refs", (j) => { info(j).laneRef = "Task_Fold"; }, "invalid-reference", "$.rootElements[0].flowElements[1].extensionElements.values[0].laneRef"],
  ["embedded reference objects", (j) => { flow(j).targetRef = { id: "Task_Fold" }; }, "invalid-reference", "$.rootElements[0].flowElements[0].targetRef"],
  ["unknown types", (j) => { task(j).$type = "bpmn:MadeUp"; }, "unknown-type", "$.rootElements[0].flowElements[1].$type"],
  ["unknown properties", (j) => { task(j).invented = 1; }, "unknown-property", "$.rootElements[0].flowElements[1].invented"],
  ["wrong containment", (j) => { j.rootElements[0].flowElements[1] = { $type: "bpmn:Lane", id: "Wrong" }; }, "invalid-containment", "$.rootElements[0].flowElements[1]"],
  ["nonfinite coordinates", (j) => { j.diagrams[0].plane.planeElement[0].bounds.x = Infinity; }, "invalid-value", "$.diagrams[0].plane.planeElement[0].bounds.x"],
  ["wrong primitive types", (j) => { task(j).startQuantity = "01"; }, "invalid-value", "$.rootElements[0].flowElements[1].startQuantity"],
  ["unknown required extension versions", (j) => { j.$attrs["xmlns:sem"] += "/2"; }, "unsupported-extension", "$.$attrs.xmlns:sem"],
  ["runtime fields in JSON", (j) => { task(j).$parent = "Process_Paper"; }, "reserved-name", "$.rootElements[0].flowElements[1].$parent"],
];
for (const [name, mutate, code, path] of invalid) test(`F1 should reject ${name} with a typed path`, () => {
  const j = localJson(); mutate(j);
  for (let i = 0; i < 3; i++) refusal(() => io.hydrate(j, configuration), code, path);
});
test("F1 should preserve qualified foreign attributes on typed owners", () => {
  const j = localJson(); task(j).$attrs = { "extra:note": "01" };
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(task(io.project(io.hydrate(j, configuration), configuration)).$attrs, { "extra:note": "01" });
  }
});
test("F1 should reject invalid root and configuration explicitly", () => {
  refusal(() => io.hydrate({ $type: "bpmn:Task" }, configuration), "not-bpmn", "$");
  refusal(() => io.hydrate(localJson(), { ...configuration, contractVersion: "2" }), "invalid-configuration", "$.configuration");
  refusal(() => io.hydrate(localJson(), { ...configuration, descriptors: { invalid: {} } }), "invalid-configuration", "$.configuration.descriptors");
});
test("F1 should reject detached same-ID objects during projection", () => {
  const m = io.hydrate(localJson(), configuration);
  m.rootElements[0].flowElements[0].targetRef = io.createModdle().create("bpmn:Task", { id: "Task_Fold" });
  refusal(() => io.project(m, configuration), "invalid-reference", "$.rootElements[0].flowElements[0].targetRef");
});
test("F1 should reject shared or cyclic containment rather than silently copying it", () => {
  const j = localJson(); j.rootElements.push(j.rootElements[0]);
  refusal(() => io.hydrate(j, configuration), "invalid-containment", "$.rootElements[2]");
  const m = io.hydrate(localJson(), configuration); m.rootElements.push(m.rootElements[0]);
  refusal(() => io.project(m, configuration), "invalid-containment", "$.rootElements[2]");
});
test("F1 should isolate explicit descriptor configurations in A B A order", () => {
  const extra = { name: "LocalNote", prefix: "note", uri: "urn:example:local-note", types: [{ name: "Entry", superClass: ["Element"], properties: [{ name: "text", type: "String", isAttr: true }] }] };
  const b = freeze({ ...configuration, descriptors: { ...configuration.descriptors, note: extra } });
  const j = localJson(); task(j).extensionElements.values.push({ $type: "note:Entry", text: "Local" });
  for (let i = 0; i < 3; i++) {
    const a = localJson(); assert.equal(canon(io.project(io.hydrate(a, configuration), configuration)), canon(a));
    assert.equal(canon(io.project(io.hydrate(j, b), b)), canon(j));
    refusal(() => io.hydrate(j, configuration), "unknown-type", "$.rootElements[0].flowElements[1].extensionElements.values[1].$type");
  }
});
